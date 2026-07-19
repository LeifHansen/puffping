import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { currentTenantId } from "@/lib/tenant";
import { addSuppression, removeSuppression } from "@/lib/suppression";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  const body = await req.json();

  const existing = await db.contact.findFirst({ where: { id, tenantId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  if (Object.keys(data).length) {
    await db.contact.update({ where: { id }, data });
  }

  // Opt-out flows through the suppression list so it stays consistent everywhere.
  if (body.optedOut !== undefined) {
    if (body.optedOut) await addSuppression(tenantId, existing.phone, "manual");
    else await removeSuppression(tenantId, existing.phone);
  }

  // Tags: full replacement when `tags` array is provided.
  if (Array.isArray(body.tags)) {
    const tags = [...new Set((body.tags as string[]).map((t) => String(t).trim()).filter(Boolean))];
    await db.contactTag.deleteMany({ where: { contactId: id } });
    if (tags.length) {
      await db.contactTag.createMany({ data: tags.map((tag) => ({ contactId: id, tag })) });
    }
  }

  const contact = await db.contact.findUnique({ where: { id }, include: { tagLinks: true } });
  return NextResponse.json({ contact });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  await db.contact.deleteMany({ where: { id, tenantId } });
  return NextResponse.json({ ok: true });
}
