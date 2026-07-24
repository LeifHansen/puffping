import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

/**
 * Stripe webhook: keeps each workspace's plan + subscription status in sync.
 * Verifies the Stripe-Signature header against STRIPE_WEBHOOK_SECRET (manual
 * HMAC — no SDK dependency). Fails closed (503) when the secret is missing so
 * forged events can never change a workspace's plan.
 */
const SIGNATURE_TOLERANCE_SECONDS = 300; // Stripe-recommended replay window

function verifyStripeSignature(payload: string, header: string, secret: string): boolean {
  // Header: t=timestamp,v1=signature[,v1=...]
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")));
  const timestamp = Number(parts["t"]);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false; // replay guard
  const expected = createHmac("sha256", secret).update(`${parts["t"]}.${payload}`).digest("hex");
  const provided = parts["v1"] ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const payload = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  // Fail CLOSED: without the secret we cannot verify authenticity, and these
  // events change billing state.
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  if (!verifyStripeSignature(payload, sig, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  const obj = event.data?.object ?? {};
  const metadata = (obj.metadata as Record<string, string>) ?? {};
  const tenantId = metadata.tenantId || (obj.client_reference_id as string) || null;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        if (tenantId) {
          await db.tenant.updateMany({
            where: { id: tenantId },
            data: {
              plan: metadata.planId || "starter",
              planStatus: "active",
              stripeCustomerId: (obj.customer as string) ?? undefined,
              stripeSubscriptionId: (obj.subscription as string) ?? undefined,
            },
          });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const status = event.type.endsWith("deleted")
          ? "canceled"
          : (obj.status as string) === "past_due"
            ? "past_due"
            : "active";
        const subId = obj.id as string;
        await db.tenant.updateMany({
          where: { stripeSubscriptionId: subId },
          data: {
            planStatus: status,
            ...(status === "canceled" ? { plan: "free" } : {}),
          },
        });
        break;
      }
    }
  } catch (err) {
    console.error("[puffping] stripe webhook handling failed:", err);
  }

  return NextResponse.json({ received: true });
}
