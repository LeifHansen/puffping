import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
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
  const contact = await db.contact.update({ where: { id }, data });
  return NextResponse.json({ contact });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.contact.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
