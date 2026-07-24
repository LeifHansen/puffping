import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  const body = await req.json();
  try {
    const result = await db.template.updateMany({
      where: { id, tenantId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.mediaUrl !== undefined ? { mediaUrl: body.mediaUrl || null } : {}),
      },
    });
    if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch {
    // Unique (tenantId, name) violation on rename
    return NextResponse.json({ error: "A template with that name already exists" }, { status: 409 });
  }
  const template = await db.template.findUnique({ where: { id } });
  return NextResponse.json({ template });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  await db.template.deleteMany({ where: { id, tenantId } });
  return NextResponse.json({ ok: true });
}
