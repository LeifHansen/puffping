import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  const campaign = await db.campaign.findFirst({
    where: { id, tenantId },
    include: { lists: { include: { list: true } } },
  });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stats = await db.message.groupBy({
    by: ["status"],
    where: { campaignId: id },
    _count: true,
  });

  // Replies: inbound messages after send start from phones this campaign texted.
  // Subquery join keeps this scalable at 100k+ recipients.
  const since = campaign.startedAt ?? campaign.createdAt;
  const replyRows = await db.$queryRaw<{ n: bigint | number }[]>`
    SELECT COUNT(*) AS n FROM "Message" m
    WHERE m.direction = 'inbound'
      AND m.tenantId = ${tenantId}
      AND m.createdAt >= ${since}
      AND m.phone IN (SELECT DISTINCT phone FROM "Message" WHERE campaignId = ${id})
  `;
  const replyCount = Number(replyRows[0]?.n ?? 0);

  // Click tracking: total clicks + unique contacts who clicked.
  const clickAgg = await db.trackedLink.aggregate({
    where: { campaignId: id },
    _sum: { clicks: true },
  });
  const uniqueRows = await db.$queryRaw<{ n: bigint | number }[]>`
    SELECT COUNT(DISTINCT lc."contactId") AS n
    FROM "LinkClick" lc
    JOIN "TrackedLink" tl ON tl.id = lc."trackedLinkId"
    WHERE tl."campaignId" = ${id} AND lc."contactId" IS NOT NULL
  `;
  const clicks = clickAgg._sum.clicks ?? 0;
  const uniqueClicks = Number(uniqueRows[0]?.n ?? 0);

  return NextResponse.json({
    campaign,
    stats: Object.fromEntries(stats.map((s) => [s.status, s._count])),
    replyCount,
    clicks,
    uniqueClicks,
  });
}

/**
 * Reschedule or cancel a scheduled campaign.
 *  - { scheduledAt: ISO } reschedules (must be in the future, campaign must be
 *    draft or scheduled).
 *  - { action: "cancel" } reverts a scheduled campaign back to draft.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const campaign = await db.campaign.findFirst({ where: { id, tenantId } });
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["draft", "scheduled"].includes(campaign.status)) {
    return NextResponse.json(
      { error: `Cannot modify a campaign that is ${campaign.status}` },
      { status: 400 }
    );
  }

  if (body.action === "cancel") {
    const updated = await db.campaign.update({
      where: { id },
      data: { status: "draft", scheduledAt: null },
    });
    return NextResponse.json({ campaign: updated });
  }

  if (body.scheduledAt) {
    const when = new Date(body.scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      return NextResponse.json({ error: "scheduledAt must be a future time" }, { status: 400 });
    }
    const updated = await db.campaign.update({
      where: { id },
      data: { status: "scheduled", scheduledAt: when },
    });
    return NextResponse.json({ campaign: updated });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  await db.campaign.deleteMany({ where: { id, tenantId } });
  return NextResponse.json({ ok: true });
}
