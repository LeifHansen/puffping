import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser, switchWorkspace } from "@/lib/auth";

function slugify(s: string): string {
  return (
    s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "workspace"
  );
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ workspaces: session.workspaces, activeTenantId: session.tenantId });
}

/** Switch active workspace ({ tenantId }) or create a new one ({ name }). */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (body.tenantId) {
    const ok = await switchWorkspace(String(body.tenantId));
    if (!ok) return NextResponse.json({ error: "Not a member of that workspace" }, { status: 403 });
    return NextResponse.json({ ok: true, activeTenantId: body.tenantId });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });

  const base = slugify(name);
  let slug = base;
  for (let i = 0; await db.tenant.findUnique({ where: { slug } }); i++) {
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (i > 5) break;
  }
  const tenant = await db.tenant.create({
    data: { slug, name, memberships: { create: { userId: session.userId, role: "owner" } } },
  });
  await switchWorkspace(tenant.id);
  return NextResponse.json({ ok: true, tenant }, { status: 201 });
}
