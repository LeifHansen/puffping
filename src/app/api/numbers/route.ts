import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";
import { sendingNumberStatus } from "@/lib/send";

/** The workspace's numbers, plus whether it can send (it needs at least one). */
export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const [numbers, verified, sending] = await Promise.all([
    db.phoneNumber.findMany({ where: { tenantId }, orderBy: { purchasedAt: "desc" } }),
    db.tollFreeVerification.findMany({ where: { tenantId, status: "approved" }, select: { phoneNumberSid: true } }),
    sendingNumberStatus(tenantId),
  ]);
  // Same rule as the sender list in lib/send: pooled, and verified if toll-free.
  const approved = new Set(verified.map((v) => v.phoneNumberSid));
  return NextResponse.json({
    numbers: numbers.map((n) => ({
      ...n,
      canSend: n.inMessagingService && (n.numberType !== "tollfree" || approved.has(n.twilioSid)),
    })),
    sending,
  });
}
