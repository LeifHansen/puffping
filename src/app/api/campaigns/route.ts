import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const campaigns = await db.campaign.findMany({
    where: { tenantId },
    include: {
      lists: { include: { list: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Attach delivery stats per campaign
  const stats = await db.message.groupBy({
    by: ["campaignId", "status"],
    where: { tenantId, campaignId: { not: null } },
    _count: true,
  });
  const byId: Record<string, Record<string, number>> = {};
  for (const s of stats) {
    if (!s.campaignId) continue;
    byId[s.campaignId] ??= {};
    byId[s.campaignId][s.status] = s._count;
  }

  // Total tracked-link clicks per campaign.
  const clickRows = await db.trackedLink.groupBy({
    by: ["campaignId"],
    where: { tenantId, campaignId: { not: null } },
    _sum: { clicks: true },
  });
  const clicksById: Record<string, number> = {};
  for (const r of clickRows) {
    if (r.campaignId) clicksById[r.campaignId] = r._sum.clicks ?? 0;
  }

  return NextResponse.json({
    campaigns: campaigns.map((c) => ({ ...c, stats: byId[c.id] ?? {}, clicks: clicksById[c.id] ?? 0 })),
  });
}

export async function POST(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const body = await req.json();
  const listIds: string[] = Array.isArray(body.listIds) ? body.listIds : [];
  const segmentId: string | null = body.segmentId ? String(body.segmentId) : null;

  if (!body.name?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: "Name and message body are required" }, { status: 400 });
  }
  if (!segmentId && !listIds.length) {
    return NextResponse.json({ error: "Select a segment or at least one list" }, { status: 400 });
  }

  // Validate the audience source belongs to this tenant.
  let ownedLists: { id: string }[] = [];
  if (segmentId) {
    const seg = await db.segment.findFirst({ where: { id: segmentId, tenantId }, select: { id: true } });
    if (!seg) return NextResponse.json({ error: "Segment not found" }, { status: 400 });
  } else {
    ownedLists = await db.contactList.findMany({
      where: { tenantId, id: { in: listIds } },
      select: { id: true },
    });
    if (!ownedLists.length) {
      return NextResponse.json({ error: "No valid lists selected" }, { status: 400 });
    }
  }

  // Validate an optional future schedule.
  let scheduledAt: Date | null = null;
  if (body.scheduledAt) {
    scheduledAt = new Date(body.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "scheduledAt must be a future time" }, { status: 400 });
    }
  }

  const campaign = await db.campaign.create({
    data: {
      tenantId,
      name: body.name.trim(),
      body: body.body,
      mediaUrl: body.mediaUrl || null,
      scheduledAt,
      status: scheduledAt ? "scheduled" : "draft",
      segmentId,
      lists: segmentId ? undefined : { create: ownedLists.map((l) => ({ listId: l.id })) },
    },
  });
  return NextResponse.json({ campaign }, { status: 201 });
}
