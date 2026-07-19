import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canManage, newInviteToken, ROLES } from "@/lib/team";

/** List members + pending invitations for the active workspace. */
export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberships = await db.membership.findMany({
    where: { tenantId: session.tenantId },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const invites = await db.invitation.findMany({
    where: { tenantId: session.tenantId, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    members: memberships.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      isYou: m.userId === session.userId,
    })),
    invites: invites.map((i) => ({ id: i.id, email: i.email, role: i.role, token: i.token })),
    canManage: canManage(session.role),
  });
}

/** Invite a teammate by email ({ email, role }). Owner/admin only. */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) return NextResponse.json({ error: "Only owners/admins can invite" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const role = ROLES.includes(body.role) && body.role !== "owner" ? body.role : "member";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  // Already a member?
  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    const already = await db.membership.findUnique({
      where: { userId_tenantId: { userId: existingUser.id, tenantId: session.tenantId } },
    });
    if (already) return NextResponse.json({ error: "That person is already a member" }, { status: 409 });
  }

  const invite = await db.invitation.upsert({
    where: { tenantId_email: { tenantId: session.tenantId, email } },
    create: { tenantId: session.tenantId, email, role, token: newInviteToken(), invitedBy: session.userId },
    update: { role },
  });

  // If the invitee already has an account, join them immediately.
  if (existingUser) {
    await db.membership.upsert({
      where: { userId_tenantId: { userId: existingUser.id, tenantId: session.tenantId } },
      create: { userId: existingUser.id, tenantId: session.tenantId, role },
      update: {},
    });
    await db.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
    return NextResponse.json({ ok: true, joined: true });
  }

  // Otherwise they join when they sign up with this email.
  return NextResponse.json({ ok: true, invite: { email: invite.email, token: invite.token } }, { status: 201 });
}

/** Remove a member ({ userId }) or revoke an invite ({ inviteId }). Owner/admin only. */
export async function DELETE(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) return NextResponse.json({ error: "Only owners/admins can remove" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const inviteId = searchParams.get("inviteId");

  if (inviteId) {
    await db.invitation.deleteMany({ where: { id: inviteId, tenantId: session.tenantId } });
    return NextResponse.json({ ok: true });
  }
  if (userId) {
    if (userId === session.userId) return NextResponse.json({ error: "You can't remove yourself" }, { status: 400 });
    // Never remove the last owner.
    const target = await db.membership.findUnique({ where: { userId_tenantId: { userId, tenantId: session.tenantId } } });
    if (target?.role === "owner") {
      const owners = await db.membership.count({ where: { tenantId: session.tenantId, role: "owner" } });
      if (owners <= 1) return NextResponse.json({ error: "Can't remove the last owner" }, { status: 400 });
    }
    await db.membership.deleteMany({ where: { userId, tenantId: session.tenantId } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "userId or inviteId required" }, { status: 400 });
}
