import { randomBytes } from "crypto";
import { db } from "./db";

export const ROLES = ["owner", "admin", "member"] as const;
export type Role = (typeof ROLES)[number];

/** Roles allowed to manage the workspace (invite/remove members, billing). */
export function canManage(role: string): boolean {
  return role === "owner" || role === "admin";
}

export function newInviteToken(): string {
  return randomBytes(24).toString("hex");
}

/**
 * Accept any pending invitations addressed to this email: create a membership
 * per invited workspace (idempotent) and mark the invite accepted. Called on
 * signup; inviting an email that already has an account joins them immediately
 * in the team route instead.
 */
export async function acceptInvitationsForUser(userId: string, email: string): Promise<number> {
  const pending = await db.invitation.findMany({
    where: { email: email.toLowerCase(), acceptedAt: null },
  });
  let joined = 0;
  for (const inv of pending) {
    await db.membership.upsert({
      where: { userId_tenantId: { userId, tenantId: inv.tenantId } },
      create: { userId, tenantId: inv.tenantId, role: inv.role },
      update: {},
    });
    await db.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    joined++;
  }
  return joined;
}
