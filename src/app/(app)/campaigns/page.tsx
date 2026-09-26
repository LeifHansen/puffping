"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { NO_SENDING_NUMBER, SendingNumberNotice, useSendingStatus } from "@/components/sending-number-notice";

type Campaign = {
  id: string;
  name: string;
  body: string;
  status: string;
  failureReason: string | null;
  scheduledAt: string | null;
  createdAt: string;
  lists: { list: { name: string } }[];
  _count: { messages: number };
  stats: Record<string, number>;
  clicks: number;
};

export default function CampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { status: sendingStatus, reload: reloadSending } = useSendingStatus();
  // No number to send from. Unknown status (null) doesn't block — the API
  // refuses sends without a number regardless.
  const blocked = sendingStatus?.canSend === false;
  const blockedReason = (blocked && sendingStatus?.reason) || undefined;

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns").then((r) => r.json());
      setCampaigns(res.campaigns ?? []);
    } catch {
      setCampaigns([]);
      setError("Couldn't load campaigns — refresh to try again.");
    }
  }, []);

  useEffect(() => {
    load();
    // Error handed off from "Save & send now" on the new-campaign page.
    const sendError = new URLSearchParams(window.location.search).get("sendError");
    if (sendError) {
      setError(sendError);
      window.history.replaceState(null, "", "/campaigns");
    }
  }, [load]);

  /** Run a campaign action, surfacing API errors instead of failing silently. */
  async function act(c: Campaign, url: string, init: RequestInit) {
    setBusy(c.id);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Request failed (HTTP ${res.status})`);
        if (data.code === NO_SENDING_NUMBER) reloadSending();
      }
    } catch {
      setError("Request failed — check your connection and try again.");
    } finally {
      setBusy(null);
      load();
    }
  }

  function send(c: Campaign) {
    if (!confirm(`Send "${c.name}" now?`)) return;
    return act(c, `/api/campaigns/${c.id}/send`, { method: "POST" });
  }

  function cancelSchedule(c: Campaign) {
    if (!confirm(`Cancel the scheduled send for "${c.name}"? It reverts to a draft.`)) return;
    return act(c, `/api/campaigns/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
  }

  function remove(c: Campaign) {
    if (!confirm(`Delete campaign "${c.name}"?`)) return;
    return act(c, `/api/campaigns/${c.id}`, { method: "DELETE" });
  }

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Mass SMS/MMS sends with delivery tracking"
        actions={<Button onClick={() => router.push("/campaigns/new")}>+ New campaign</Button>}
      />
      <SendingNumberNotice status={sendingStatus} className="mb-4" />
      {error && <p className="mb-3 text-sm font-bold text-red-400">{error}</p>}

      {campaigns === null ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : campaigns.length === 0 ? (
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
                    {c.status === "failed" && c.failureReason && (
                      <p className="mt-1 text-xs text-red-400">{c.failureReason}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {["draft", "scheduled", "failed"].includes(c.status) && (
                      <Button onClick={() => send(c)} disabled={busy === c.id || blocked} title={blockedReason}>
                        {busy === c.id ? "Sending…" : "Send now"}
                      </Button>
                    )}
                    {c.status === "scheduled" && (
                      <Button variant="secondary" onClick={() => cancelSchedule(c)} disabled={busy === c.id}>
                        Cancel
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => remove(c)} disabled={busy === c.id}>
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
