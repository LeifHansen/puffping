import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canManage } from "@/lib/team";
import {
  PLANS,
  planById,
  monthlyUsage,
  isBillingConfigured,
  createCheckoutSession,
} from "@/lib/billing";
import { appBaseUrl } from "@/lib/twilio";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: session.tenantId } });
  const usage = await monthlyUsage(session.tenantId);
  const plan = planById(tenant.plan);
  return NextResponse.json({
    plans: PLANS,
    currentPlan: plan.id,
    planStatus: tenant.planStatus,
    usage,
    quota: plan.messageQuota,
    billingConfigured: isBillingConfigured(),
    canManage: canManage(session.role),
  });
}

/** Start a Stripe Checkout for a plan ({ planId }). Owner/admin only. */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) return NextResponse.json({ error: "Only owners/admins can manage billing" }, { status: 403 });

  if (!isBillingConfigured()) {
    return NextResponse.json(
      { error: "Billing isn't configured yet. Set STRIPE_SECRET_KEY and the plan price IDs to enable upgrades." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const plan = PLANS.find((p) => p.id === body.planId);
  if (!plan || plan.id === "free") return NextResponse.json({ error: "Choose a paid plan" }, { status: 400 });
  const priceId = plan.stripePriceEnv ? process.env[plan.stripePriceEnv] : undefined;
  if (!priceId) {
    return NextResponse.json({ error: `Missing price id (${plan.stripePriceEnv}) for the ${plan.name} plan` }, { status: 400 });
  }

  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: session.tenantId } });
  const url = await createCheckoutSession({
    tenantId: session.tenantId,
    planId: plan.id,
    priceId,
    customerEmail: session.email,
    stripeCustomerId: tenant.stripeCustomerId,
    successUrl: `${appBaseUrl()}/settings?billing=success`,
    cancelUrl: `${appBaseUrl()}/settings?billing=cancelled`,
  });
  return NextResponse.json({ url });
}
