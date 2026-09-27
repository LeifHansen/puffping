import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { createCheckoutSession, isBillingConfigured } from "@/lib/billing";
import { CHECKOUT_TTL_SECONDS, releaseReservation, reserveSlot, settleReservation } from "@/lib/slots";
import { canManage } from "@/lib/team";
import { appBaseUrl } from "@/lib/twilio";

/**
 * Buy a number slot: reserve one from inventory, then hand off to Stripe
 * Checkout ($25/mo subscription). The slot turns `active` when the
 * checkout.session.completed webhook lands. Owner/admin only.
 */
export async function POST() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) {
    return NextResponse.json({ error: "Only owners/admins can buy number slots" }, { status: 403 });
  }
  const priceId = process.env.STRIPE_PRICE_NUMBER_SLOT;
  if (!isBillingConfigured() || !priceId) {
    return NextResponse.json(
      { error: "Billing isn't configured yet. Set STRIPE_SECRET_KEY and STRIPE_PRICE_NUMBER_SLOT." },
      { status: 400 }
    );
  }

  // At most one open checkout per workspace: settle any earlier reservation
  // first (activates it if it was actually paid, otherwise frees it).
  const pending = await db.numberSlot.findMany({
    where: { tenantId: session.tenantId, status: "reserved" },
    select: { id: true, stripeCheckoutSessionId: true },
  });
  for (const slot of pending) {
    await settleReservation(slot).catch((err) => console.error(`[puffping] settling reservation ${slot.id}:`, err));
  }

  const expiresAt = Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS;
  const slotId = await reserveSlot(session.tenantId, new Date(expiresAt * 1000));
  if (!slotId) {
    return NextResponse.json({ error: "Number slots are sold out — more are coming soon." }, { status: 409 });
  }

  try {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: session.tenantId } });
    const checkout = await createCheckoutSession({
      tenantId: session.tenantId,
      priceId,
      customerEmail: session.email,
      stripeCustomerId: tenant.stripeCustomerId,
      metadata: { kind: "number_slot", slotId },
      expiresAt,
      successUrl: `${appBaseUrl()}/numbers?slot=success`,
      cancelUrl: `${appBaseUrl()}/numbers?slot=cancelled`,
    });
    if (!checkout) throw new Error("Billing isn't configured");
    await db.numberSlot.update({ where: { id: slotId }, data: { stripeCheckoutSessionId: checkout.id } });
    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    await releaseReservation({ slotId });
    console.error("[puffping] slot checkout failed:", err);
    return NextResponse.json({ error: "Couldn't start checkout — please try again." }, { status: 502 });
  }
}

/** Abandon this workspace's open slot checkout (e.g. back from Stripe's cancel URL) so the slot returns to inventory. */
export async function DELETE() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) {
    return NextResponse.json({ error: "Only owners/admins can manage number slots" }, { status: 403 });
  }
  const pending = await db.numberSlot.findMany({
    where: { tenantId: session.tenantId, status: "reserved" },
    select: { id: true, stripeCheckoutSessionId: true },
  });
  for (const slot of pending) {
    await settleReservation(slot).catch((err) => console.error(`[puffping] settling reservation ${slot.id}:`, err));
  }
  return NextResponse.json({ ok: true });
}
