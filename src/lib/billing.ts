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
    features: ["1,000 messages / mo", "Two-way inbox", "CSV import"],
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

/** Outbound messages sent by a tenant since the start of the current UTC month. */
export async function monthlyUsage(tenantId: string): Promise<number> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return db.message.count({
    where: { tenantId, direction: "outbound", createdAt: { gte: start } },
  });
}

/** Monthly price of one number slot (USD). Billed via STRIPE_PRICE_NUMBER_SLOT. */
export const SLOT_PRICE_MONTHLY = 25;

/**
 * Minimal Stripe REST call (form-encoded, no SDK dependency). Throws on non-2xx.
 */
export async function stripeRequest<T = Record<string, unknown>>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  form?: URLSearchParams
): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY)");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form ? form.toString() : undefined,
  });
  if (!res.ok) {
    throw new Error(`Stripe ${method} ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/**
 * Create a subscription-mode Stripe Checkout Session. `metadata` is copied onto
 * both the session and the subscription so webhooks can route either object.
 * Returns the session id + hosted checkout URL, or null if Stripe isn't configured.
 */
export async function createCheckoutSession(opts: {
  tenantId: string;
  priceId: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  stripeCustomerId?: string | null;
  metadata: Record<string, string>;
  /** Unix seconds; Stripe requires 30 min – 24 h from now. */
  expiresAt?: number;
}): Promise<{ id: string; url: string } | null> {
  if (!isBillingConfigured()) return null;

  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("line_items[0][price]", opts.priceId);
  form.set("line_items[0][quantity]", "1");
  form.set("success_url", opts.successUrl);
  form.set("cancel_url", opts.cancelUrl);
  form.set("client_reference_id", opts.tenantId);
  if (opts.stripeCustomerId) form.set("customer", opts.stripeCustomerId);
  else form.set("customer_email", opts.customerEmail);
  if (opts.expiresAt) form.set("expires_at", String(opts.expiresAt));
  const metadata = { tenantId: opts.tenantId, ...opts.metadata };
  for (const [k, v] of Object.entries(metadata)) {
    form.set(`metadata[${k}]`, v);
    form.set(`subscription_data[metadata][${k}]`, v);
  }

  const data = await stripeRequest<{ id: string; url?: string }>("POST", "checkout/sessions", form);
  if (!data.url) throw new Error("Stripe checkout session has no URL");
  return { id: data.id, url: data.url };
}
