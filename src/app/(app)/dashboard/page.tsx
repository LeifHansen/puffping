"use client";

import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

// Categorical slots validated against the dark green-black surface:
// CVD-safe adjacent order, all >= 3:1 contrast.
const SERIES = {
  outbound: "#3987e5",
  delivered: "#10b981",
  inbound: "#d55181",
};
// Neutral cool-gray chart ink (matches the beige-free UI palette).
const INK = { muted: "#6b7572", grid: "#1a221f", secondary: "#c5ccc9" };

type Dash = {
  totals: {
    contacts: number;
    optedOut: number;
    campaigns: number;
    sent: number;
    delivered: number;
    failed: number;
    inbound: number;
    unread: number;
    deliveryRate: number;
    replyRate: number;
    optOutRate: number;
  };
  series: { date: string; outbound: number; delivered: number; inbound: number }[];
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function DashboardPage() {
  const [data, setData] = useState<Dash | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <p className="text-sm text-zinc-500">Loading…</p>;

  const t = data.totals;
  const tiles = [
    { label: "Contacts", value: t.contacts.toLocaleString(), href: "/contacts" },
    { label: "Messages sent", value: t.sent.toLocaleString(), href: "/campaigns" },
    { label: "Delivery rate", value: t.sent ? pct(t.deliveryRate) : "—", href: "/campaigns" },
    { label: "Reply rate", value: t.sent ? pct(t.replyRate) : "—", href: "/inbox" },
    { label: "Opt-out rate", value: t.contacts ? pct(t.optOutRate) : "—", href: "/contacts" },
    { label: "Unread replies", value: t.unread.toLocaleString(), href: "/inbox" },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Last 30 days of sending, delivery, and engagement" />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href}>
            <Card className="transition-colors hover:border-emerald-800/60">
              <p className="text-xs text-zinc-400">{tile.label}</p>
              <p className="mt-1 text-2xl font-semibold">{tile.value}</p>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <h2 className="mb-1 text-sm font-medium">Message volume — last 30 days</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Outbound sends, confirmed deliveries, and inbound replies per day
        </p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series} margin={{ top: 4, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={INK.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: INK.muted, fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
                axisLine={{ stroke: INK.grid }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                tick={{ fill: INK.muted, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ stroke: INK.muted, strokeWidth: 1 }}
                contentStyle={{
                  background: "#0f1513",
                  border: "1px solid #283330",
                  borderRadius: 8,
                  fontSize: 12,
                  color: INK.secondary,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: INK.secondary }} iconType="plainline" />
              <Line
                type="monotone"
                dataKey="outbound"
                name="Outbound"
                stroke={SERIES.outbound}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="delivered"
                name="Delivered"
                stroke={SERIES.delivered}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="inbound"
                name="Inbound replies"
                stroke={SERIES.inbound}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <Card>
          <p className="text-xs text-zinc-400">Delivered</p>
          <p className="mt-1 text-xl font-semibold text-emerald-400">{t.delivered.toLocaleString()}</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Failed / undelivered</p>
          <p className="mt-1 text-xl font-semibold text-red-400">{t.failed.toLocaleString()}</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400">Inbound replies</p>
          <p className="mt-1 text-xl font-semibold" style={{ color: SERIES.inbound }}>
            {t.inbound.toLocaleString()}
          </p>
        </Card>
      </div>
    </div>
  );
}
