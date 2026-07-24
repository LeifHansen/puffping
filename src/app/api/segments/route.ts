import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";
import { parseDefinition, segmentWhere, describeSegment, type SegmentDefinition } from "@/lib/segments";

export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const segments = await db.segment.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
  const lists = await db.contactList.findMany({ where: { tenantId }, select: { id: true, name: true } });
  const listNames = Object.fromEntries(lists.map((l) => [l.id, l.name]));

  // Live audience count per segment.
  const withCounts = await Promise.all(
    segments.map(async (s) => {
      const def = parseDefinition(s.definition);
      const count = await db.contact.count({ where: segmentWhere(tenantId, def) });
      return { ...s, def, count, summary: describeSegment(def, listNames) };
    })
  );
  return NextResponse.json({ segments: withCounts });
}

function sanitize(body: Record<string, unknown>): SegmentDefinition {
  return {
    listIds: Array.isArray(body.listIds) ? (body.listIds as string[]).filter(Boolean) : undefined,
    tags: Array.isArray(body.tags) ? (body.tags as string[]).map(String).filter(Boolean) : undefined,
    tagMatch: body.tagMatch === "all" ? "all" : "any",
    engagement:
      body.engagement === "clicked" || body.engagement === "replied" ? (body.engagement as "clicked" | "replied") : null,
  };
}

export async function POST(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const def = sanitize(body);
  if (!def.listIds?.length && !def.tags?.length && !def.engagement) {
    return NextResponse.json({ error: "Add at least one filter (list, tag, or engagement)" }, { status: 400 });
  }

  // Only accept lists that belong to this tenant.
  if (def.listIds?.length) {
    const owned = await db.contactList.findMany({
      where: { tenantId, id: { in: def.listIds } },
      select: { id: true },
    });
    def.listIds = owned.map((l) => l.id);
  }

  let segment;
  try {
    segment = await db.segment.create({
      data: { tenantId, name, definition: JSON.stringify(def) },
    });
  } catch {
    // Unique (tenantId, name) — race-safe duplicate handling
    return NextResponse.json({ error: "A segment with that name already exists" }, { status: 409 });
  }
  const count = await db.contact.count({ where: segmentWhere(tenantId, def) });
  return NextResponse.json({ segment: { ...segment, def, count } }, { status: 201 });
}
