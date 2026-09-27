"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, Label, PageHeader } from "@/components/ui";

type Campaign = {
  id: string;
  name: string;
  messagingServiceSid: string;
  a2pCampaignSid: string | null;
  capacity: number;
  status: string;
  createdAt: string;
  slots: Record<string, number>; // status -> count
};
type AttentionNumber = {
  id: string;
  phoneNumber: string;
  status: string;
  registrationError: string | null;
  purchasedAt: string;
  tenant: { name: string };
};
type UnslottedNumber = { id: string; phoneNumber: string; numberType: string; tenant: { name: string } };
type AdminData = { available: number; campaigns: Campaign[]; attention: AttentionNumber[]; unslotted: UnslottedNumber[] };

export default function AdminConsole() {
  const [data, setData] = useState<AdminData | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ messagingServiceSid: "", name: "", capacity: "49" });

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/campaigns");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function call(url: string, init: RequestInit, success: (d: Record<string, unknown>) => string) {
    setBusy(true);
    setNotice(null);
    const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setNotice(res.ok ? { text: success(body), error: false } : { text: body.error ?? `HTTP ${res.status}`, error: true });
    load();
    return res.ok;
  }

  async function addCampaign() {
    const ok = await call(
      "/api/admin/campaigns",
      { method: "POST", body: JSON.stringify(form) },
      (d) =>
        `Campaign added — ${d.slotsCreated} slots created` +
        (Number(d.seatsAlreadyUsed) ? ` (${d.seatsAlreadyUsed} seats already used by numbers in its pool)` : "")
    );
    if (ok) setForm({ messagingServiceSid: "", name: "", capacity: "49" });
  }

  const used = (c: Campaign) => c.capacity - (c.slots.available ?? 0);

  return (
    <div>
      <PageHeader title="Platform admin" subtitle="Number slot inventory across approved 10DLC campaigns" />
      {notice && (
        <p
          className={`mb-4 rounded-md border-2 p-3 text-sm font-bold ${
            notice.error ? "border-red-800 bg-red-900 text-red-300" : "border-emerald-800 bg-emerald-900 text-emerald-300"
          }`}
        >
          {notice.text}
        </p>
      )}

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-72 flex-1">
            <Label>Messaging Service SID (with a VERIFIED A2P campaign)</Label>
            <Input
              value={form.messagingServiceSid}
              onChange={(e) => setForm({ ...form, messagingServiceSid: e.target.value })}
              placeholder="MG…"
            />
          </div>
          <div className="w-48">
            <Label>Name (optional)</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Campaign 2" />
          </div>
          <div className="w-24">
            <Label>Slots</Label>
            <Input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          </div>
          <Button onClick={addCampaign} disabled={busy || !form.messagingServiceSid.trim()}>
            Add campaign
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t-2 border-[color:var(--color-zinc-800)] pt-3">
          <p className="text-sm text-zinc-400">
            <span className="font-bold text-zinc-200">{data?.available ?? "—"}</span> slots available for sale
          </p>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              call("/api/admin/events", { method: "POST" }, (d) =>
                d.created
                  ? `Registration events connected (sink ${d.sinkSid}, ${d.sinkStatus})`
                  : `Registration events already connected (sink ${d.sinkSid}, ${d.sinkStatus})`
              )
            }
          >
            Connect registration events
          </Button>
        </div>
      </Card>

      <h2 className="mb-3 text-sm font-medium text-zinc-400">Campaigns</h2>
      {!data ? null : data.campaigns.length === 0 ? (
        <EmptyState title="No campaigns yet" hint="Add a Messaging Service that has a VERIFIED A2P campaign to create 49 slots." />
      ) : (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {data.campaigns.map((c) => (
            <Card key={c.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold">{c.name}</span>
                <Badge status={c.status} />
              </div>
              <p className="mt-1 font-mono text-[11px] text-zinc-500">
                {c.messagingServiceSid}
                {c.a2pCampaignSid ? ` · ${c.a2pCampaignSid}` : ""}
              </p>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full border-2 border-[color:var(--color-zinc-700)] bg-zinc-800">
                <div className="h-full bg-emerald-600" style={{ width: `${(used(c) / c.capacity) * 100}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-zinc-400">
                {used(c)}/{c.capacity} used · {c.slots.available ?? 0} available · {c.slots.active ?? 0} active ·{" "}
                {c.slots.past_due ?? 0} past due · {c.slots.reserved ?? 0} in checkout
              </p>
              <div className="mt-3">
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    call(
                      `/api/admin/campaigns/${c.id}`,
                      { method: "PATCH", body: JSON.stringify({ status: c.status === "active" ? "retired" : "active" }) },
                      () => (c.status === "active" ? `${c.name} retired — no new slots will be sold` : `${c.name} reactivated`)
                    )
                  }
                >
                  {c.status === "active" ? "Retire (stop selling)" : "Reactivate"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 text-sm font-medium text-zinc-400">Numbers awaiting registration</h2>
      {!data ? null : data.attention.length === 0 ? (
        <p className="mb-6 text-sm text-zinc-500">None — every claimed number has finished carrier registration.</p>
      ) : (
        <Card className="mb-6 p-0">
          <ul className="divide-y divide-zinc-800">
            {data.attention.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div>
                  <span className="font-mono">{n.phoneNumber}</span>
                  <span className="ml-2 text-xs text-zinc-500">
                    {n.tenant.name} · claimed {new Date(n.purchasedAt).toLocaleDateString()}
                  </span>
                  {n.registrationError && <p className="mt-0.5 text-xs text-red-400">{n.registrationError}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge status={n.status} />
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      if (!confirm(`Mark ${n.phoneNumber} as registered? Only do this after confirming it in the Twilio console.`)) return;
                      call(`/api/admin/numbers/${n.id}/activate`, { method: "POST" }, () => `${n.phoneNumber} marked active`);
                    }}
                  >
                    Mark active
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data && data.unslotted.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-medium text-zinc-400">Numbers without a slot (cannot send)</h2>
          <Card className="p-0">
            <ul className="divide-y divide-zinc-800">
              {data.unslotted.map((n) => (
                <li key={n.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="font-mono">{n.phoneNumber}</span>
                  <span className="text-xs text-zinc-500">
                    {n.tenant.name} · {n.numberType}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
