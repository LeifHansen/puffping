import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { queueCampaign } from "@/lib/send";
import { isTwilioConfigured } from "@/lib/twilio";
import { currentTenantId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

/**
 * Kick off a campaign send. Enqueues all recipients (fast, even at 100k
 * contacts) and returns immediately; the background worker drains the queue
 * and the dashboard/status webhook track delivery in real time.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const tenantId = await currentTenantId(req);
  if (!isTwilioConfigured()) {
    return NextResponse.json({ error: "Twilio is not configured" }, { status: 400 });
  }
  const campaign = await db.campaign.findFirst({ where: { id, tenantId } });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // ATOMIC claim: flip to `sending` only from a sendable state, in one
  // conditional update. Two concurrent clicks (or a click racing the
  // scheduler) can't both enqueue — the loser gets a 409. Also prevents
  // re-blasting an already-sent campaign.
  const claim = await db.campaign.updateMany({
    where: { id, tenantId, status: { in: ["draft", "scheduled", "failed"] } },
    data: { status: "sending", startedAt: new Date() },
  });
  if (claim.count === 0) {
    return NextResponse.json(
      { error: `Campaign is ${campaign.status === "sending" ? "already sending" : `already ${campaign.status}`}` },
      { status: 409 }
    );
  }
  try {
    const result = await queueCampaign(id);
    return NextResponse.json({ ...result, status: "sending" });
  } catch (err) {
    await db.campaign.update({ where: { id }, data: { status: "failed" } });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 500 }
    );
  }
}
