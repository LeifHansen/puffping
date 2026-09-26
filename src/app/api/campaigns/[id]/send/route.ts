import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { NO_SENDING_NUMBER, NoSendingNumberError, queueCampaign, sendingNumberStatus } from "@/lib/send";
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

  // Every message must go out from one of the workspace's own numbers. Check
  // before claiming, so a workspace without one keeps its campaign untouched.
  const sending = await sendingNumberStatus(tenantId);
  if (!sending.canSend) {
    return NextResponse.json({ error: sending.reason, code: NO_SENDING_NUMBER }, { status: 409 });
  }

  // ATOMIC claim: flip to `sending` only from a sendable state, in one
  // conditional update. Two concurrent clicks (or a click racing the
  // scheduler) can't both enqueue — the loser gets a 409. Also prevents
  // re-blasting an already-sent campaign.
  const claim = await db.campaign.updateMany({
    where: { id, tenantId, status: { in: ["draft", "scheduled", "failed"] } },
    data: { status: "sending", startedAt: new Date(), enqueuedAt: null, failureReason: null },
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
    // A number can disappear between the check above and queueing.
    const noNumber = err instanceof NoSendingNumberError;
    const reason = noNumber ? err.message : "Couldn't start sending — try again.";
    if (!noNumber) console.error(`[puffping] campaign ${id} failed to enqueue:`, err);
    await db.campaign.update({ where: { id }, data: { status: "failed", failureReason: reason } });
    return NextResponse.json(
      noNumber ? { error: reason, code: NO_SENDING_NUMBER } : { error: reason },
      { status: noNumber ? 409 : 500 }
    );
  }
}
