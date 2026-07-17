import { cookies } from "next/headers";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "./db";
import { SESSION_COOKIE } from "./session-cookie";

export { SESSION_COOKIE };

const scrypt = promisify(scryptCb);
const SESSION_TTL_DAYS = 30;

// ---------------------------------------------------------------------------
// Password hashing (scrypt — built-in, no native deps for the Docker build)
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const hashBuf = Buffer.from(hash, "hex");
  return hashBuf.length === derived.length && timingSafeEqual(hashBuf, derived);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

/** Create a session for a user and set the httpOnly cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { token, userId, expiresAt } });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export type SessionUser = {
  userId: string;
  email: string;
  name: string | null;
  tenantId: string;
  tenantName: string;
  role: string;
};

/**
 * Resolve the current authenticated user + their active tenant from the
 * session cookie. Returns null if unauthenticated or the session is invalid /
 * expired. This is the source of truth for auth in server components and route
 * handlers.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        include: { memberships: { include: { tenant: true }, orderBy: { createdAt: "asc" }, take: 1 } },
      },
    },
  });
  if (!session || session.expiresAt < new Date()) return null;

  const membership = session.user.memberships[0];
  if (!membership) return null; // user with no workspace — shouldn't happen

  return {
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    tenantId: membership.tenantId,
    tenantName: membership.tenant.name,
    role: membership.role,
  };
}

/** Clear the current session (logout): delete the row and expire the cookie. */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.deleteMany({ where: { token } });
    store.delete(SESSION_COOKIE);
  }
}
