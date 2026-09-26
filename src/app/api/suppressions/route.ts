import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";
import { addSuppressions, removeSuppression } from "@/lib/suppression";

export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const suppressions = await db.suppression.findMany({
    where: { tenantId, ...(q ? { phone: { contains: q } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const total = await db.suppression.count({ where: { tenantId } });
  return NextResponse.json({ suppressions, total });
}

/** Add one or many phones to the suppression list (accepts pasted/newline lists). */
export async function POST(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const body = await req.json().catch(() => ({}));
  const raw: string = String(body.phones ?? body.phone ?? "");
  const candidates = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  if (!candidates.length) return NextResponse.json({ error: "No phone numbers provided" }, { status: 400 });

  return NextResponse.json(await addSuppressions(tenantId, candidates, "manual"));
}

export async function DELETE(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");
  if (!phone) return NextResponse.json({ error: "phone is required" }, { status: 400 });
  await removeSuppression(tenantId, phone);
  return NextResponse.json({ ok: true });
}
