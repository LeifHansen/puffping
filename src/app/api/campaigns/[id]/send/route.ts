import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { queueCampaign } from "@/lib/send";
import { isTwilioConfigured } from "@/lib/twilio";

type Params = { params: Promise<{ id: string }> };

/**
 * Kick off a campaign send. Enqueues all recipients (fast, even at 100k
 * contacts) and returns immediately; the background worker drains the queue
 * and the dashboard/status webhook track delivery in real time.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  if (!isTwilioConfigured()) {
    return NextResponse.json({ error: "Twilio is not configured" }, { status: 400 });
  }
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (campaign.status === "sending") {
    return NextResponse.json({ error: "Campaign is already sending" }, { status: 409 });
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
