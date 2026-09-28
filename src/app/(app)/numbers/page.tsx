"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, Label, PageHeader } from "@/components/ui";

/**
 * Number marketplace. Each number lives in a slot on one of PuffPing's
 * carrier-approved 10DLC campaigns (49 slots per campaign). Buy a slot
 * ($25/mo), then search for and claim a local number into it; the number can
 * send once its carrier registration completes.
 */

type SlotNumber = { id: string; phoneNumber: string; status: string; registrationError: string | null };
type Slot = {
  id: string;
  status: string; // reserved | active | past_due
  comped: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  purchasedAt: string | null;
  phoneNumber: SlotNumber | null;
};
type Marketplace = {
  available: number;
  priceMonthly: number;
  billingConfigured: boolean;
  twilioConfigured: boolean;
  canManage: boolean;
  slots: Slot[];
};
type AvailableNumber = { phoneNumber: string; friendlyName: string; locality: string | null; region: string | null };

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "");

export default function NumbersPage() {
  const [market, setMarket] = useState<Marketplace | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [buying, setBuying] = useState(false);
  const [busySlot, setBusySlot] = useState<string | null>(null);

  // Number search for the slot being filled
  const [claimFor, setClaimFor] = useState<string | null>(null);
  const [areaCode, setAreaCode] = useState("");
  const [contains, setContains] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<AvailableNumber[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/slots");
    if (res.ok) setMarket(await res.json());
    return res.ok;
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("slot");
    if (outcome) window.history.replaceState(null, "", window.location.pathname);

    if (outcome === "cancelled") {
      setNotice({ text: "Checkout cancelled — no charge was made.", error: false });
      fetch("/api/slots/purchase", { method: "DELETE" }).finally(load);
      return;
    }
    load();
    if (outcome !== "success") return;

    // Stripe's webhook usually lands within seconds; poll briefly until the slot is paid.
    setNotice({ text: "Payment received — activating your slot…", error: false });
    let tries = 0;
    const timer = setInterval(async () => {
      tries++;
      const res = await fetch("/api/slots");
      if (!res.ok) return;
      const data: Marketplace = await res.json();
      setMarket(data);
      const stillReserved = data.slots.some((s) => s.status === "reserved");
      if (!stillReserved || tries >= 12) {
        clearInterval(timer);
        setNotice(
          stillReserved
            ? { text: "Still confirming your payment — refresh in a minute.", error: false }
            : { text: "Slot active! Choose your number below.", error: false }
        );
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);

  async function buySlot() {
    setBuying(true);
    setNotice(null);
    const res = await fetch("/api/slots/purchase", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) {
      window.location.href = data.url;
      return;
    }
    setBuying(false);
    setNotice({ text: data.error ?? `Couldn't start checkout (HTTP ${res.status})`, error: true });
    load();
  }

  function openClaim(slotId: string) {
    setClaimFor(slotId);
    setResults([]);
    setNotice(null);
  }

  async function search() {
    if (areaCode && !/^\d{3}$/.test(areaCode.trim())) {
      setNotice({ text: "Area code must be exactly 3 digits (e.g. 415).", error: true });
      return;
    }
    if (contains && !/^[a-zA-Z0-9*]{1,10}$/.test(contains.trim())) {
      setNotice({ text: "Pattern can only contain letters, digits, or * (max 10 characters).", error: true });
      return;
    }
    setSearching(true);
    setNotice(null);
    const params = new URLSearchParams();
    if (areaCode) params.set("areaCode", areaCode.trim());
    if (contains) params.set("contains", contains.trim());
    try {
      const res = await fetch(`/api/numbers/search?${params}`);
      const data = await res.json();
      if (!res.ok) {
        setNotice({ text: data.error || `Search failed (HTTP ${res.status})`, error: true });
        setResults([]);
      } else {
        setResults(data.numbers ?? []);
        if (!data.numbers?.length) setNotice({ text: "No numbers matched — try a different area code or pattern.", error: false });
      }
    } catch {
      setNotice({ text: "Search request failed — check your connection and try again.", error: true });
    }
    setSearching(false);
  }

  async function claim(slotId: string, phoneNumber: string) {
    if (!confirm(`Claim ${phoneNumber} for this slot?`)) return;
    setBusySlot(slotId);
    setNotice(null);
    const res = await fetch(`/api/slots/${slotId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber }),
    });
    const data = await res.json().catch(() => ({}));
    setBusySlot(null);
    if (!res.ok) {
      setNotice({ text: data.error ?? `Claim failed (HTTP ${res.status})`, error: true });
      return;
    }
    setNotice({ text: `${phoneNumber} is yours — it can send once carrier registration completes.`, error: false });
    setClaimFor(null);
    setResults([]);
    load();
  }

  async function setCancel(slot: Slot, cancel: boolean) {
    const question = slot.comped
      ? "Release this number now? It can't be recovered."
      : "Cancel this slot? You keep the number until the end of the paid period, then it's released.";
    if (cancel && !confirm(question)) return;
    setBusySlot(slot.id);
    const res = await fetch(`/api/slots/${slot.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resume: !cancel }),
    });
    const data = await res.json().catch(() => ({}));
    setBusySlot(null);
    if (!res.ok) setNotice({ text: data.error ?? `Update failed (HTTP ${res.status})`, error: true });
    load();
  }

  const soldOut = market ? market.available === 0 : false;
  const buyBlocked = !market || soldOut || !market.billingConfigured || !market.canManage;

  return (
    <div>
      <PageHeader
        title="Numbers"
        subtitle="Dedicated local numbers on PuffPing's carrier-approved 10DLC campaigns — one number per slot"
      />
      {notice && (
        <p
          className={`mb-4 rounded-md border-2 p-3 text-sm font-bold ${
            notice.error ? "border-red-800 bg-red-900 text-red-300" : "border-emerald-800 bg-emerald-900 text-emerald-300"
          }`}
        >
          {notice.text}
        </p>
      )}

      {/* ---------- Marketplace ---------- */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Number slots</p>
            <p className="mt-1 text-3xl font-extrabold text-emerald-700">
              {market ? market.available : "—"} <span className="text-base font-bold text-zinc-400">available</span>
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              ${market?.priceMonthly ?? 25}/month per slot · your own local number · registered on an approved campaign
            </p>
          </div>
          <div className="text-right">
            <Button onClick={buySlot} disabled={buyBlocked || buying}>
              {buying ? "Opening checkout…" : soldOut ? "Sold out" : `Buy a slot — $${market?.priceMonthly ?? 25}/mo`}
            </Button>
            {market && soldOut && <p className="mt-2 text-xs text-zinc-500">More slots are coming soon.</p>}
            {market && !soldOut && !market.billingConfigured && (
              <p className="mt-2 text-xs text-zinc-500">Billing isn&apos;t configured on this deployment yet.</p>
            )}
            {market && !market.canManage && (
              <p className="mt-2 text-xs text-zinc-500">Ask a workspace owner or admin to buy slots.</p>
            )}
          </div>
        </div>
      </Card>

      {/* ---------- Your slots ---------- */}
      <h2 className="mb-3 text-sm font-medium text-zinc-400">Your slots</h2>
      {!market ? null : market.slots.length === 0 ? (
        <EmptyState
          title="No number slots yet"
          hint="Buy a slot, then pick a local number for it. Each slot holds one dedicated number that only your workspace sends from."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {market.slots.map((slot) => (
            <Card key={slot.id}>
              <SlotSummary slot={slot} price={market.priceMonthly} />

              <div className="mt-3 flex flex-wrap gap-2">
                {slot.status !== "reserved" && !slot.phoneNumber && market.canManage && claimFor !== slot.id && (
                  <Button onClick={() => openClaim(slot.id)} disabled={slot.status !== "active"}>
                    Choose a number
                  </Button>
                )}
                {slot.status !== "reserved" && market.canManage && (
                  <Button
                    variant={slot.cancelAtPeriodEnd ? "secondary" : "ghost"}
                    onClick={() => setCancel(slot, !slot.cancelAtPeriodEnd)}
                    disabled={busySlot === slot.id}
                  >
                    {slot.cancelAtPeriodEnd ? "Keep this slot" : slot.comped ? "Release number" : "Cancel slot"}
                  </Button>
                )}
              </div>

              {claimFor === slot.id && (
                <div className="mt-4 border-t-2 border-[color:var(--color-zinc-800)] pt-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-28">
                      <Label>Area code</Label>
                      <Input value={areaCode} onChange={(e) => setAreaCode(e.target.value)} placeholder="415" maxLength={3} />
                    </div>
                    <div className="w-36">
                      <Label>Contains</Label>
                      <Input value={contains} onChange={(e) => setContains(e.target.value)} placeholder="e.g. PUFF or 420" />
                    </div>
                    <Button onClick={search} disabled={searching}>
                      {searching ? "Searching…" : "Search"}
                    </Button>
                    <Button variant="ghost" onClick={() => setClaimFor(null)}>
                      Close
                    </Button>
                  </div>
                  {results.length > 0 && (
                    <ul className="mt-3 max-h-72 divide-y divide-zinc-800 overflow-y-auto rounded-xl border-2 border-[color:var(--color-zinc-800)]">
                      {results.map((n) => (
                        <li key={n.phoneNumber} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <div>
                            <span className="font-mono">{n.friendlyName || n.phoneNumber}</span>
                            <span className="ml-2 text-xs text-zinc-500">
                              {[n.locality, n.region].filter(Boolean).join(", ")}
                            </span>
                          </div>
                          <Button
                            variant="secondary"
                            onClick={() => claim(slot.id, n.phoneNumber)}
                            disabled={busySlot === slot.id}
                          >
                            {busySlot === slot.id ? "Claiming…" : "Claim"}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SlotSummary({ slot, price }: { slot: Slot; price: number }) {
  const n = slot.phoneNumber;
  let badge = "active";
  let line: string;

  if (slot.status === "reserved") {
    badge = "reserved";
    line = "Awaiting payment — finish checkout to activate this slot.";
  } else if (slot.status === "past_due") {
    badge = "past_due";
    line = "Payment past due — sending from this number is paused until billing is updated.";
  } else if (!n) {
    badge = "unclaimed";
    line = "Paid — choose the local number for this slot.";
  } else if (n.status === "pending_registration") {
    badge = "registering";
    line = "Registering with carriers on the approved campaign — it can send once registration completes.";
  } else if (n.status === "registration_failed") {
    badge = "registration_failed";
    line = `Carrier registration failed${n.registrationError ? `: ${n.registrationError}` : ""}. Contact support.`;
  } else {
    line = "Active — sending from this number.";
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-base font-bold">{n ? n.phoneNumber : "No number yet"}</span>
        <Badge status={badge} />
      </div>
      <p className="mt-1 text-xs text-zinc-400">{line}</p>
      <p className="mt-1 text-xs text-zinc-500">
        {slot.comped ? "Included with your workspace" : slot.status === "reserved" ? "" : `$${price}/mo`}
        {slot.cancelAtPeriodEnd && slot.currentPeriodEnd
          ? ` · cancels ${fmtDate(slot.currentPeriodEnd)}`
          : slot.currentPeriodEnd && !slot.comped
            ? ` · renews ${fmtDate(slot.currentPeriodEnd)}`
            : ""}
      </p>
    </div>
  );
}
