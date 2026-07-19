import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { currentTenantId } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const listId = searchParams.get("listId");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(200, Number(searchParams.get("pageSize") ?? 50));

  const where = {
    tenantId,
    ...(q
      ? {
          OR: [
            { phone: { contains: q } },
            { firstName: { contains: q } },
            { lastName: { contains: q } },
            { email: { contains: q } },
          ],
        }
      : {}),
    ...(listId ? { memberships: { some: { listId } } } : {}),
  };

  const [contacts, total] = await Promise.all([
    db.contact.findMany({
      where,
      include: { memberships: { include: { list: true } }, tagLinks: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.contact.count({ where }),
  ]);

  return NextResponse.json({ contacts, total, page, pageSize });
}

export async function POST(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const body = await req.json();
  const phone = normalizePhone(body.phone ?? "");
  if (!phone) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }
  try {
    const contact = await db.contact.create({
      data: {
        tenantId,
        phone,
        firstName: body.firstName || null,
        lastName: body.lastName || null,
        email: body.email || null,
        customFields: body.customFields ? JSON.stringify(body.customFields) : null,
        ...(body.listId ? { memberships: { create: { listId: body.listId } } } : {}),
      },
    });
    return NextResponse.json({ contact }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "A contact with that phone number already exists" }, { status: 409 });
  }
}
