import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { currentTenantId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.phone !== undefined) {
    const phone = normalizePhone(body.phone);
    if (!phone) return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    data.phone = phone;
  }
  for (const key of ["firstName", "lastName", "email"] as const) {
    if (body[key] !== undefined) data[key] = body[key] || null;
  }
  if (body.customFields !== undefined) data.customFields = JSON.stringify(body.customFields);
  if (body.optedOut !== undefined) {
    data.optedOut = Boolean(body.optedOut);
    data.optedOutAt = body.optedOut ? new Date() : null;
  }
  const result = await db.contact.updateMany({ where: { id, tenantId }, data });
  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const contact = await db.contact.findUnique({ where: { id } });
  return NextResponse.json({ contact });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  await db.contact.deleteMany({ where: { id, tenantId } });
  return NextResponse.json({ ok: true });
}
