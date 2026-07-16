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

  return NextResponse.json({
    campaign,
    stats: Object.fromEntries(stats.map((s) => [s.status, s._count])),
    replyCount,
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  await db.campaign.deleteMany({ where: { id, tenantId } });
  return NextResponse.json({ ok: true });
}
