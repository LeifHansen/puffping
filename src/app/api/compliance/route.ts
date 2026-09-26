import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPlatformCampaignStatus, syncSendingPool } from "@/lib/platform-10dlc";
import { currentTenantId } from "@/lib/tenant";
import { isTwilioConfigured } from "@/lib/twilio";

/** Platform 10DLC campaign status + this workspace's sender-pool coverage. */
export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const [status, total, pooled] = await Promise.all([
    getPlatformCampaignStatus(),
    db.phoneNumber.count({ where: { tenantId } }),
    db.phoneNumber.count({ where: { tenantId, inMessagingService: true } }),
  ]);
  if (status.error) console.error("[puffping] platform campaign status check failed:", status.error);
  // Raw Twilio errors can include account paths — keep them in server logs.
  const { error, ...campaign } = status;
  return NextResponse.json({
    campaign: { ...campaign, error: error ? "Live status unavailable right now" : undefined },
    numbers: { total, pooled },
  });
}

/** Re-attach this workspace's numbers to the approved sending pool. */
export async function POST(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  if (!isTwilioConfigured()) {
    return NextResponse.json({ error: "Twilio is not configured" }, { status: 400 });
  }
  try {
    return NextResponse.json(await syncSendingPool(tenantId));
  } catch (err) {
    console.error("[puffping] sending pool sync failed:", err);
    return NextResponse.json({ error: "Couldn't reach Twilio to sync numbers — try again shortly." }, { status: 502 });
  }
}
