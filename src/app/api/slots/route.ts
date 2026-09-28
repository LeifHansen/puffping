import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { isBillingConfigured, SLOT_PRICE_MONTHLY } from "@/lib/billing";
import { availableSlotCount } from "@/lib/slots";
import { canManage } from "@/lib/team";
import { isTwilioConfigured } from "@/lib/twilio";

/** Marketplace inventory + this workspace's slots (with their numbers). */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [available, slots] = await Promise.all([
    availableSlotCount(),
    db.numberSlot.findMany({
      where: {
        tenantId: session.tenantId,
        OR: [{ status: { in: ["active", "past_due"] } }, { status: "reserved", reservedUntil: { gt: new Date() } }],
      },
      orderBy: [{ purchasedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        status: true,
        comped: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: true,
        purchasedAt: true,
        phoneNumber: { select: { id: true, phoneNumber: true, status: true, registrationError: true } },
      },
    }),
  ]);

  return NextResponse.json({
    available,
    priceMonthly: SLOT_PRICE_MONTHLY,
    billingConfigured: isBillingConfigured() && Boolean(process.env.STRIPE_PRICE_NUMBER_SLOT),
    twilioConfigured: isTwilioConfigured(),
    canManage: canManage(session.role),
    slots,
  });
}
