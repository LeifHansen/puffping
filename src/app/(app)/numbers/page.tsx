"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, Label, PageHeader, Select } from "@/components/ui";

type OwnedNumber = {
  id: string;
  phoneNumber: string;
  friendlyName: string | null;
  numberType: string;
  inMessagingService: boolean;
};
type AvailableNumber = {
  phoneNumber: string;
  friendlyName: string;
  locality: string | null;
  region: string | null;
};

export default function NumbersPage() {
  const [owned, setOwned] = useState<OwnedNumber[]>([]);
  const [available, setAvailable] = useState<AvailableNumber[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [type, setType] = useState<"local" | "tollfree">("local");
  const [areaCode, setAreaCode] = useState("");
  const [contains, setContains] = useState("");
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeIsError, setNoticeIsError] = useState(false);

  const loadOwned = useCallback(async () => {
    const res = await fetch("/api/numbers").then((r) => r.json());
    setOwned(res.numbers ?? []);
  }, []);

  useEffect(() => {
    loadOwned();
  }, [loadOwned]);

  async function search() {
    // Client-side validation with clear messages (Twilio's own errors are terse).
    if (type === "local" && areaCode && !/^\d{3}$/.test(areaCode.trim())) {
      setNotice("Area code must be exactly 3 digits (e.g. 415).");
      setNoticeIsError(true);
      return;
    }
    if (contains && !/^[a-zA-Z0-9*]{1,10}$/.test(contains.trim())) {
      setNotice("Pattern can only contain letters, digits, or * (max 10 characters).");
      setNoticeIsError(true);
      return;
    }
    setSearching(true);
    setNotice(null);
    setNoticeIsError(false);
    setSelected([]);
    const params = new URLSearchParams({ type });
    if (areaCode && type === "local") params.set("areaCode", areaCode.trim());
    if (contains) params.set("contains", contains.trim());
    try {
      const res = await fetch(`/api/numbers/search?${params}`);
      const data = await res.json();
      setSearching(false);
      if (!res.ok) {
        setNotice(data.error || `Search failed (HTTP ${res.status})`);
        setNoticeIsError(true);
        setAvailable([]);
        return;
      }
      setAvailable(data.numbers ?? []);
      if (!data.numbers?.length) setNotice("No numbers matched — try a different area code or pattern.");
    } catch {
      setSearching(false);
      setNotice("Search request failed — check your connection and try again.");
      setNoticeIsError(true);
    }
  }

  function toggle(pn: string) {
    setSelected((prev) => (prev.includes(pn) ? prev.filter((x) => x !== pn) : [...prev, pn]));
  }

  async function purchase() {
    if (!selected.length) return;
    if (!confirm(`Purchase ${selected.length} number(s)? Twilio charges apply.`)) return;
    setBuying(true);
    setNotice(null);
    setNoticeIsError(false);
    const res = await fetch("/api/numbers/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumbers: selected }),
    });
    const data = await res.json();
    setBuying(false);
    const parts = [];
    if (data.purchased?.length) parts.push(`Purchased: ${data.purchased.join(", ")}`);
    if (data.failed?.length) {
      parts.push(
        `Failed: ${data.failed
          .map((f: { phoneNumber: string; error: string }) => `${f.phoneNumber} (${f.error})`)
          .join(" · ")}`
      );
    }
    setNotice(parts.join(" · ") || data.error);
    setNoticeIsError(Boolean(data.failed?.length || (!data.purchased?.length && data.error)));
    setSelected([]);
    setAvailable((prev) => prev.filter((n) => !data.purchased?.includes(n.phoneNumber)));
    loadOwned();
  }

  return (
    <div>
      <PageHeader
        title="Numbers"
        subtitle="Shop for and purchase local (10DLC) or toll-free numbers — purchased numbers auto-join your messaging service pool"
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Label>Type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value as "local" | "tollfree")}>
              <option value="local">Local (10DLC)</option>
              <option value="tollfree">Toll-free</option>
            </Select>
          </div>
          {type === "local" && (
            <div className="w-32">
              <Label>Area code</Label>
              <Input value={areaCode} onChange={(e) => setAreaCode(e.target.value)} placeholder="415" maxLength={3} />
            </div>
          )}
          <div className="w-40">
            <Label>Contains (optional)</Label>
            <Input value={contains} onChange={(e) => setContains(e.target.value)} placeholder="e.g. PUFF or 420" />
          </div>
          <Button onClick={search} disabled={searching}>
            {searching ? "Searching…" : "Search numbers"}
          </Button>
          {selected.length > 0 && (
            <Button variant="secondary" onClick={purchase} disabled={buying}>
              {buying ? "Purchasing…" : `Buy ${selected.length} selected`}
            </Button>
          )}
        </div>
        {notice && (
          <p className={`mt-3 text-sm font-bold ${noticeIsError ? "text-red-400" : "text-emerald-300"}`}>
            {notice}
          </p>
        )}
      </Card>

      {available.length > 0 && (
        <Card className="mb-6 p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="px-4 py-2.5 w-10" />
                <th className="px-4 py-2.5 font-medium">Number</th>
                <th className="px-4 py-2.5 font-medium">Location</th>
              </tr>
            </thead>
            <tbody>
              {available.map((n) => (
                <tr
                  key={n.phoneNumber}
                  onClick={() => toggle(n.phoneNumber)}
                  className="cursor-pointer border-b border-zinc-800/60 hover:bg-zinc-900/40"
                >
                  <td className="px-4 py-2.5">
                    <input type="checkbox" readOnly checked={selected.includes(n.phoneNumber)} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs">{n.friendlyName || n.phoneNumber}</td>
                  <td className="px-4 py-2.5 text-zinc-400">
                    {[n.locality, n.region].filter(Boolean).join(", ") || "Toll-free (nationwide)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <h2 className="mb-3 text-sm font-medium text-zinc-400">Your numbers</h2>
      {owned.length === 0 ? (
        <EmptyState title="No numbers purchased yet" hint="Search above and buy one or several in a single click." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {owned.map((n) => (
            <Card key={n.id}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm">{n.phoneNumber}</span>
                <Badge status={n.numberType === "tollfree" ? "scheduled" : "delivered"} />
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {n.numberType === "tollfree" ? "Toll-free" : "Local 10DLC"} ·{" "}
                {n.inMessagingService ? "in messaging service pool" : "not pooled yet"}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
