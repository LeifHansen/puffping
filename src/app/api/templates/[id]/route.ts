import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const template = await db.template.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.mediaUrl !== undefined ? { mediaUrl: body.mediaUrl || null } : {}),
    },
  });
  return NextResponse.json({ template });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await db.template.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
