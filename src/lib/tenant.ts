import type { NextRequest } from "next/server";
import type { Tenant } from "@prisma/client";
import { db } from "./db";
import { getSessionUser } from "./auth";

/**
 * Multi-tenancy chokepoint.
 *
 * Every query scopes by `tenantId`; this module decides *which* tenant a
 * request belongs to. It now resolves the tenant from the authenticated
 * session (see src/lib/auth.ts) — so each signed-in user only ever sees their
 * own workspace's data. Requests with no valid session fall back to the default
 * tenant (used by the seed + webhooks); protected API routes are additionally
 * gated by middleware, so unauthenticated callers never reach a handler.
 */

const DEFAULT_SLUG = "default";

let cachedDefaultId: string | null = null;

/** Ensure the default tenant exists and return it. Safe to call repeatedly. */
export async function getDefaultTenant(): Promise<Tenant> {
  return db.tenant.upsert({
    where: { slug: DEFAULT_SLUG },
    create: { slug: DEFAULT_SLUG, name: "PuffPing Workspace" },
    update: {},
  });
}

/** Cheap tenant id for the default tenant (memoized). */
export async function getDefaultTenantId(): Promise<string> {
  if (cachedDefaultId) return cachedDefaultId;
  const tenant = await getDefaultTenant();
  cachedDefaultId = tenant.id;
  return tenant.id;
}

/** Resolve the tenant for the current request from the auth session. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function resolveTenant(req?: NextRequest): Promise<Tenant> {
  const session = await getSessionUser();
  if (session) return db.tenant.findUniqueOrThrow({ where: { id: session.tenantId } });
  return getDefaultTenant();
}

/** Convenience: just the tenant id for the current request (from the session). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function currentTenantId(req?: NextRequest): Promise<string> {
  const session = await getSessionUser();
  if (session) return session.tenantId;
  return getDefaultTenantId();
}

/**
 * The messaging service SID to send from. CURRENT MODEL: every workspace sends
 * through the platform's single approved Messaging Service
 * (TWILIO_MESSAGING_SERVICE_SID) on the main Twilio account — purchased
 * numbers are attached to its pool but tracked per-tenant. A tenant-specific
 * service (per-tenant Twilio / ISV subaccounts) is only used if the env var is
 * unset.
 */
export function tenantMessagingServiceSid(tenant: Pick<Tenant, "twilioMessagingServiceSid">): string | undefined {
  return process.env.TWILIO_MESSAGING_SERVICE_SID || tenant.twilioMessagingServiceSid || undefined;
}
