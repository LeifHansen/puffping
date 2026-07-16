import { NextRequest, NextResponse } from "next/server";
import { subDays, startOfDay, format } from "date-fns";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";

const DELIVERED = ["delivered"];
const FAILED = ["failed", "undelivered"];

export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const since = startOfDay(subDays(new Date(), 29));

  const [contactCount, optedOutCount, campaignCount, statusGroups, recentMessages, unread] =
    await Promise.all([
      db.contact.count({ where: { tenantId } }),
      db.contact.count({ where: { tenantId, optedOut: true } }),
      db.campaign.count({ where: { tenantId } }),
      db.message.groupBy({ by: ["status", "direction"], where: { tenantId }, _count: true }),
      db.message.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: { createdAt: true, direction: true, status: true },
      }),
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

  // 30-day time series: outbound / delivered / inbound per day
  const days: Record<string, { date: string; outbound: number; delivered: number; inbound: number }> = {};
  for (let i = 29; i >= 0; i--) {
    const d = format(subDays(new Date(), i), "yyyy-MM-dd");
    days[d] = { date: d, outbound: 0, delivered: 0, inbound: 0 };
  }
  for (const m of recentMessages) {
    const d = format(m.createdAt, "yyyy-MM-dd");
    const bucket = days[d];
    if (!bucket) continue;
    if (m.direction === "inbound") bucket.inbound++;
    else {
      bucket.outbound++;
      if (DELIVERED.includes(m.status)) bucket.delivered++;
    }
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
