import { getSessionUser, type SessionUser } from "./auth";

/**
 * Platform admins (PuffPing operators, not workspace owners) manage campaign
 * inventory. Configured by email in PLATFORM_ADMIN_EMAILS (comma-separated).
 */
export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.toLowerCase());
}

/** The signed-in platform admin, or null (callers respond 404 so the surface isn't advertised). */
export async function platformAdminSession(): Promise<SessionUser | null> {
  const session = await getSessionUser();
  return session && isPlatformAdmin(session.email) ? session : null;
}
