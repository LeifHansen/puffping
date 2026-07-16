import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const campaigns = await db.campaign.findMany({
    include: {
      lists: { include: { list: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Attach delivery stats per campaign
  const stats = await db.message.groupBy({
    by: ["campaignId", "status"],
    where: { campaignId: { not: null } },
    _count: true,
  });
  const byId: Record<string, Record<string, number>> = {};
  for (const s of stats) {
    if (!s.campaignId) continue;
    byId[s.campaignId] ??= {};
    byId[s.campaignId][s.status] = s._count;
  }

  return NextResponse.json({
    campaigns: campaigns.map((c) => ({ ...c, stats: byId[c.id] ?? {} })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name?.trim() || !body.body?.trim() || !Array.isArray(body.listIds) || !body.listIds.length) {
    return NextResponse.json({ error: "Name, message body, and at least one list are required" }, { status: 400 });
  }
  const campaign = await db.campaign.create({
    data: {
      name: body.name.trim(),
      body: body.body,
      mediaUrl: body.mediaUrl || null,
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      status: body.scheduledAt ? "scheduled" : "draft",
      lists: { create: (body.listIds as string[]).map((listId) => ({ listId })) },
    },
  });
  return NextResponse.json({ campaign }, { status: 201 });
}
