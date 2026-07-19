"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";

type Campaign = {
  id: string;
  name: string;
  body: string;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  lists: { list: { name: string } }[];
  _count: { messages: number };
  stats: Record<string, number>;
  clicks: number;
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/campaigns").then((r) => r.json());
    setCampaigns(res.campaigns ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function send(c: Campaign) {
    if (!confirm(`Send "${c.name}" now?`)) return;
    setBusy(c.id);
    setError(null);
    const res = await fetch(`/api/campaigns/${c.id}/send`, { method: "POST" });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) setError(data.error);
    load();
  }

  async function cancelSchedule(c: Campaign) {
    if (!confirm(`Cancel the scheduled send for "${c.name}"? It reverts to a draft.`)) return;
    setBusy(c.id);
    await fetch(`/api/campaigns/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    setBusy(null);
    load();
  }

  async function remove(c: Campaign) {
    if (!confirm(`Delete campaign "${c.name}"?`)) return;
    await fetch(`/api/campaigns/${c.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Mass SMS/MMS sends with delivery tracking"
        actions={
          <Link href="/campaigns/new">
            <Button>+ New campaign</Button>
          </Link>
        }
      />
      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      {campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet" hint="Create a campaign to send your first blast." />
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const delivered = c.stats.delivered ?? 0;
            const failed = (c.stats.failed ?? 0) + (c.stats.undelivered ?? 0);
            const ctr = delivered > 0 ? Math.round((c.clicks / delivered) * 100) : 0;
            return (
              <Card key={c.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{c.name}</h3>
                      <Badge status={c.status} />
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-zinc-400">{c.body}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Lists: {c.lists.map((l) => l.list.name).join(", ") || "—"} · {c._count.messages} messages ·{" "}
                      {delivered} delivered · {failed} failed · {c.clicks} clicks
                      {delivered > 0 && c.clicks > 0 ? ` (${ctr}% CTR)` : ""}
                    </p>
                    {c.status === "scheduled" && c.scheduledAt && (
                      <p className="mt-1 text-xs text-emerald-400">
                        ⏰ Scheduled for {new Date(c.scheduledAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {["draft", "scheduled", "failed"].includes(c.status) && (
                      <Button onClick={() => send(c)} disabled={busy === c.id}>
                        {busy === c.id ? "Sending…" : "Send now"}
                      </Button>
                    )}
                    {c.status === "scheduled" && (
                      <Button variant="secondary" onClick={() => cancelSchedule(c)} disabled={busy === c.id}>
                        Cancel
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => remove(c)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
