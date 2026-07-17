import type { NextRequest } from "next/server";
import type { Tenant } from "@prisma/client";
import { db } from "./db";

/**
 * Multi-tenancy chokepoint.
 *
 * The whole app scopes every query by `tenantId`; this module is the ONE place
 * that decides *which* tenant a request belongs to. Today it runs in
 * single-tenant mode and always returns the default tenant. To go multi-tenant,
 * change only `resolveTenant()` — e.g. read the subdomain (`acme.puffping.io`),
 * a session cookie, or a JWT claim — and everything downstream keeps working.
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

/**
 * Resolve the tenant for an incoming request.
 *
 * SINGLE-TENANT (today): always the default tenant.
 * MULTI-TENANT (later): parse `req` — subdomain, `x-tenant` header, session, or
 * JWT — map it to a Tenant row, and return that. The signature already takes the
 * request so callers don't change when this is upgraded.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function resolveTenant(req?: NextRequest): Promise<Tenant> {
  // TODO(multi-tenant): derive from req.headers.get("host") subdomain or session.
  return getDefaultTenant();
}

/** Convenience: just the tenant id for the current request. */
export async function currentTenantId(req?: NextRequest): Promise<string> {
  if (!req) return getDefaultTenantId();
  const tenant = await resolveTenant(req);
  return tenant.id;
}

/**
 * The messaging service SID to send from for a tenant: prefer the tenant's own
 * (full multi-tenant), else fall back to the global env var (single-tenant).
 */
export function tenantMessagingServiceSid(tenant: Pick<Tenant, "twilioMessagingServiceSid">): string | undefined {
  return tenant.twilioMessagingServiceSid || process.env.TWILIO_MESSAGING_SERVICE_SID || undefined;
}
