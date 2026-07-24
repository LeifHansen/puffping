import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";

const DELIVERED = ["delivered"];
const FAILED = ["failed", "undelivered"];

/** YYYY-MM-DD in UTC — must match the DB's date_trunc (timestamps are UTC). */
function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  // Start of the UTC day 29 days ago — same timezone the DB buckets in, so
  // edge days can't be dropped or misattributed on a non-UTC server.
  const since = new Date(new Date().setUTCHours(0, 0, 0, 0) - 29 * 86_400_000);

  // 30-day daily series computed in one grouped aggregate (not by fetching every
  // message and bucketing in JS — that would pull 100k+ rows at scale).
  type SeriesRow = { day: string; outbound: bigint; delivered: bigint; inbound: bigint };

  const [contactCount, optedOutCount, campaignCount, statusGroups, seriesRows, unread] =
    await Promise.all([
      db.contact.count({ where: { tenantId } }),
      db.contact.count({ where: { tenantId, optedOut: true } }),
      db.campaign.count({ where: { tenantId } }),
      db.message.groupBy({ by: ["status", "direction"], where: { tenantId }, _count: true }),
      db.$queryRaw<SeriesRow[]>`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
               COUNT(*) FILTER (WHERE direction = 'outbound') AS outbound,
               COUNT(*) FILTER (WHERE direction = 'outbound' AND status = 'delivered') AS delivered,
               COUNT(*) FILTER (WHERE direction = 'inbound') AS inbound
        FROM "Message"
        WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${since}
        GROUP BY 1
      `,
      db.conversation.aggregate({ where: { tenantId }, _sum: { unreadCount: true } }),
    ]);

  let sent = 0;
  let delivered = 0;
  let failedCount = 0;
  let inbound = 0;
  for (const g of statusGroups) {
    if (g.direction === "inbound") {
      inbound += g._count;
      continue;
    }
    sent += g._count;
    if (DELIVERED.includes(g.status)) delivered += g._count;
    if (FAILED.includes(g.status)) failedCount += g._count;
  }

  // 30-day time series: seed every UTC day at 0, then fill from the grouped query.
  const days: Record<string, { date: string; outbound: number; delivered: number; inbound: number }> = {};
  for (let i = 29; i >= 0; i--) {
    const d = utcDayKey(new Date(Date.now() - i * 86_400_000));
    days[d] = { date: d, outbound: 0, delivered: 0, inbound: 0 };
  }
  for (const r of seriesRows) {
    const bucket = days[r.day];
    if (!bucket) continue;
    bucket.outbound = Number(r.outbound);
    bucket.delivered = Number(r.delivered);
    bucket.inbound = Number(r.inbound);
  }

  return NextResponse.json({
    totals: {
      contacts: contactCount,
      optedOut: optedOutCount,
      campaigns: campaignCount,
      sent,
      delivered,
      failed: failedCount,
      inbound,
      unread: unread._sum.unreadCount ?? 0,
      deliveryRate: sent ? delivered / sent : 0,
      replyRate: sent ? inbound / sent : 0,
      optOutRate: contactCount ? optedOutCount / contactCount : 0,
    },
    series: Object.values(days),
  });
}
