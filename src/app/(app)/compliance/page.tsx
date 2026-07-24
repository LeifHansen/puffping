"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, PageHeader, Select, TextArea } from "@/components/ui";

/**
 * Compliance page — PLATFORM-MANAGED 10DLC MODEL.
 *
 * Self-serve A2P 10DLC registration is disabled: every workspace sends through
 * PuffPing's approved Messaging Service on the main Twilio account, and numbers
 * purchased on the Numbers page are attached to that service's pool
 * automatically. (The old self-serve wizard lives in git history and can come
 * back if per-tenant ISV registration returns.)
 *
 * Toll-free verification remains self-serve since it's per-number.
 */

type Verification = { id: string; phoneNumber: string; status: string; rejectionReason: string | null };
type OwnedNumber = { twilioSid: string; phoneNumber: string; numberType: string; inMessagingService: boolean };

export default function CompliancePage() {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [numbers, setNumbers] = useState<OwnedNumber[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTf, setShowTf] = useState(false);
  const [tf, setTf] = useState<Record<string, string>>({
    phoneNumberSid: "",
    useCaseSummary: "Marketing messages (sales, discounts, product alerts) to opted-in customers.",
    productionMessageSample: "Hi! Everything is 20% off this weekend. Reply STOP to opt out.",
    optInType: "WEB_FORM",
    messageVolume: "10,000",
    businessName: "",
    businessWebsite: "",
    addressStreet: "",
    addressCity: "",
    addressState: "",
    addressPostalCode: "",
    contactFirstName: "",
    contactLastName: "",
    contactEmail: "",
    contactPhone: "",
  });

  const load = useCallback(async () => {
    const [tfRes, numRes] = await Promise.all([
      fetch("/api/registration/tollfree").then((r) => r.json()),
      fetch("/api/numbers").then((r) => r.json()),
    ]);
    setVerifications(tfRes.verifications ?? []);
    setNumbers(numRes.numbers ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tollfreeNumbers = numbers.filter((n) => n.numberType === "tollfree");
  const pooled = numbers.filter((n) => n.inMessagingService).length;

  const set = (k: string, v: string) => setTf((prev) => ({ ...prev, [k]: v }));

  const field = (label: string, key: string, placeholder = "") => (
    <div>
      <Label>{label}</Label>
      <Input value={tf[key] ?? ""} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} />
    </div>
  );

  async function submitTollfree() {
    const num = tollfreeNumbers.find((n) => n.twilioSid === tf.phoneNumberSid);
    if (!num) {
      setError("Select a toll-free number (buy one on the Numbers page first).");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/registration/tollfree", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...tf, phoneNumber: num.phoneNumber }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? data.verification?.rejectionReason);
      return;
    }
    setShowTf(false);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Compliance"
        subtitle="Carrier registration, handled by PuffPing — you just buy numbers and send"
      />
      {error && <p className="mb-4 rounded-md border-2 border-red-800 bg-red-900 p-3 text-sm font-bold text-red-300">{error}</p>}

      {/* ---------- 10DLC: platform-managed ---------- */}
      <Card className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-extrabold text-emerald-700">A2P 10DLC — managed by PuffPing ✓</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Your workspace sends through PuffPing&apos;s carrier-approved 10DLC campaign — no registration
              paperwork needed. Local numbers you purchase on the <span className="font-bold">Numbers</span> page
              join the approved sending pool automatically.
            </p>
          </div>
          <Badge status="registered" />
        </div>
        <div className="mt-3 grid gap-2 text-sm text-zinc-400 md:grid-cols-3">
          <div className="rounded-xl border-2 border-[color:var(--color-zinc-800)] bg-[color:var(--color-brand-cream)] px-3 py-2">
            <span className="font-bold text-zinc-300">Campaign</span>: approved
          </div>
          <div className="rounded-xl border-2 border-[color:var(--color-zinc-800)] bg-[color:var(--color-brand-cream)] px-3 py-2">
            <span className="font-bold text-zinc-300">Your numbers</span>: {numbers.length}
          </div>
          <div className="rounded-xl border-2 border-[color:var(--color-zinc-800)] bg-[color:var(--color-brand-cream)] px-3 py-2">
            <span className="font-bold text-zinc-300">In sending pool</span>: {pooled}
          </div>
        </div>
      </Card>

      {/* ---------- Toll-free verification (still self-serve, per number) ---------- */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-extrabold text-emerald-700">Toll-free verification</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              Verify a toll-free number for high-throughput sending. Buy one on the Numbers page first.
            </p>
          </div>
          <Button onClick={() => setShowTf((s) => !s)}>{showTf ? "Hide form" : "Verify a number"}</Button>
        </div>

        {verifications.length > 0 && (
          <div className="mt-3 space-y-2">
            {verifications.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-xl border-2 border-[color:var(--color-zinc-800)] bg-[color:var(--color-brand-cream)] p-3 text-sm">
                <div>
                  <span className="font-mono">{v.phoneNumber}</span>
                  {v.rejectionReason && <p className="mt-0.5 text-xs text-red-400">{v.rejectionReason}</p>}
                </div>
                <Badge status={v.status} />
              </div>
            ))}
          </div>
        )}

        {showTf && (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Toll-free number</Label>
                <Select value={tf.phoneNumberSid} onChange={(e) => set("phoneNumberSid", e.target.value)}>
                  <option value="">— select —</option>
                  {tollfreeNumbers.map((n) => (
                    <option key={n.twilioSid} value={n.twilioSid}>
                      {n.phoneNumber}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Opt-in type</Label>
                <Select value={tf.optInType} onChange={(e) => set("optInType", e.target.value)}>
                  {["WEB_FORM", "VERBAL", "PAPER_FORM", "VIA_TEXT", "MOBILE_QR_CODE"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Monthly volume</Label>
                <Select value={tf.messageVolume} onChange={(e) => set("messageVolume", e.target.value)}>
                  {["1,000", "10,000", "100,000", "250,000", "500,000"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </Select>
              </div>
            </div>

            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">Business details</p>
            <div className="grid gap-3 md:grid-cols-2">
              {field("Legal business name", "businessName", "Green Leaf LLC")}
              {field("Website", "businessWebsite", "https://greenleaf.com")}
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {field("Street", "addressStreet", "123 Main St")}
              {field("City", "addressCity", "Denver")}
              {field("State", "addressState", "CO")}
              {field("ZIP", "addressPostalCode", "80202")}
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              {field("Contact first name", "contactFirstName")}
              {field("Contact last name", "contactLastName")}
              {field("Contact email", "contactEmail", "you@company.com")}
              {field("Contact phone", "contactPhone", "+1 555 123 4567")}
            </div>

            <div>
              <Label>Use case summary</Label>
              <TextArea rows={2} value={tf.useCaseSummary} onChange={(e) => set("useCaseSummary", e.target.value)} />
            </div>
            <div>
              <Label>Production message sample</Label>
              <TextArea rows={2} value={tf.productionMessageSample} onChange={(e) => set("productionMessageSample", e.target.value)} />
            </div>
            <Button onClick={submitTollfree} disabled={busy}>
              {busy ? "Submitting…" : "Submit verification"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
