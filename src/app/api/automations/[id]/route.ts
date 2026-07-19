import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

/** Toggle enabled/disabled (other edits: delete + recreate from the UI). */
export async function PATCH(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const automation = await db.automation.findFirst({ where: { id, tenantId } });
  if (!automation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: { enabled?: boolean } = {};
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await db.automation.update({ where: { id }, data });
  return NextResponse.json({ automation: updated });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  // Cascade removes steps + enrollments.
  await db.automation.deleteMany({ where: { id, tenantId } });
  return NextResponse.json({ ok: true });
}
