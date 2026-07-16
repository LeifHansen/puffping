import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const templates = await db.template.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const body = await req.json();
  if (!body.name?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: "Name and body are required" }, { status: 400 });
  }
  try {
    const template = await db.template.create({
      data: { tenantId, name: body.name.trim(), body: body.body, mediaUrl: body.mediaUrl || null },
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "A template with that name already exists" }, { status: 409 });
  }
}
