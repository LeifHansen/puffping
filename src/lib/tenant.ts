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
 * own workspace's data. Requests with no valid session are rejected; the
 * default tenant is only for the seed + webhooks (which call
 * getDefaultTenantId() directly). Protected API routes are additionally gated
 * by middleware, so callers without a session cookie never reach a handler.
 *
 * Sending: each workspace sends only from its own numbers — numbers claimed
 * into paid slots on PuffPing's approved campaigns (see ./slots, ./sender).
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
 * Resolve the tenant for the current request from the auth session.
 * SECURITY: throws when there is no valid session — an invalid/expired cookie
 * must never fall back to the default tenant's data. The default tenant is
 * reserved for webhooks/seed paths, which call getDefaultTenantId() directly.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function resolveTenant(req?: NextRequest): Promise<Tenant> {
  const session = await getSessionUser();
  if (!session) throw new Error("Unauthorized: sign in required");
  return db.tenant.findUniqueOrThrow({ where: { id: session.tenantId } });
}

/** Convenience: just the tenant id for the current request (from the session). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function currentTenantId(req?: NextRequest): Promise<string> {
  const session = await getSessionUser();
  if (!session) throw new Error("Unauthorized: sign in required");
  return session.tenantId;
}
