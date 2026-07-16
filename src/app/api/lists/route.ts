import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const lists = await db.contactList.findMany({
    where: { tenantId },
    include: { _count: { select: { memberships: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ lists });
}

export async function POST(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  try {
    const list = await db.contactList.create({ data: { tenantId, name: body.name.trim() } });
    return NextResponse.json({ list }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "A list with that name already exists" }, { status: 409 });
  }
}
