import { db } from "./db";

/**
 * Billing. Stripe-backed but fully optional: with no STRIPE_SECRET_KEY the app
 * runs on the free plan and the upgrade flow reports that billing isn't
 * configured (same graceful-degradation pattern as Twilio/OpenAI).
 */

export type Plan = {
  id: string;
  name: string;
  priceMonthly: number; // USD
  messageQuota: number; // included outbound messages / month
  stripePriceEnv: string; // env var holding the Stripe price id
  features: string[];
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    messageQuota: 1_000,
    stripePriceEnv: "",
    features: ["1,000 messages / mo", "1 number", "Two-way inbox", "CSV import"],
  },
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 49,
    messageQuota: 10_000,
    stripePriceEnv: "STRIPE_PRICE_STARTER",
    features: ["10,000 messages / mo", "Automations", "Link tracking", "Segments"],
  },
  {
    id: "growth",
    name: "Growth",
    priceMonthly: 199,
    messageQuota: 100_000,
    stripePriceEnv: "STRIPE_PRICE_GROWTH",
    features: ["100,000 messages / mo", "Priority sending", "Team seats", "Everything in Starter"],
  },
];

export function isBillingConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function planById(id: string): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

/** Outbound messages sent by a tenant since the start of the current month. */
export async function monthlyUsage(tenantId: string): Promise<number> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return db.message.count({
    where: { tenantId, direction: "outbound", createdAt: { gte: start } },
  });
}

/**
 * Create a Stripe Checkout Session via the REST API (no SDK dependency).
 * Returns the hosted checkout URL, or null if Stripe isn't configured.
 */
export async function createCheckoutSession(opts: {
  tenantId: string;
  planId: string;
  priceId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  stripeCustomerId?: string | null;
}): Promise<string | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("line_items[0][price]", opts.priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("success_url", opts.successUrl);
  form.set("cancel_url", opts.cancelUrl);
  form.set("client_reference_id", opts.tenantId);
  if (opts.stripeCustomerId) form.set("customer", opts.stripeCustomerId);
  else form.set("customer_email", opts.customerEmail);
  form.set("metadata[tenantId]", opts.tenantId);
  form.set("metadata[planId]", opts.planId);
  form.set("subscription_data[metadata][tenantId]", opts.tenantId);
  form.set("subscription_data[metadata][planId]", opts.planId);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    throw new Error(`Stripe checkout failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { url?: string };
  return data.url ?? null;
}
