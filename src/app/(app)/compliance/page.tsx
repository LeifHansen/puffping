"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Input, Label, PageHeader, Select, TextArea } from "@/components/ui";
import type { SendingNumberStatus } from "@/components/sending-number-notice";

/**
 * Compliance page — PLATFORM-MANAGED 10DLC MODEL.
 *
 * Self-serve A2P 10DLC registration is disabled: every workspace sends under
 * PuffPing's carrier-approved campaign on the main Twilio account, and numbers
 * purchased on the Numbers page join that Messaging Service's pool
 * automatically. The status card reads the campaign's live carrier status from
 * /api/compliance. (The old self-serve wizard lives in git history and can come
 * back if per-tenant ISV registration returns.)
 *
 * Toll-free verification remains self-serve since it's per-number.
 */

type Verification = { id: string; phoneNumber: string; status: string; rejectionReason: string | null };
type OwnedNumber = { twilioSid: string; phoneNumber: string; numberType: string; inMessagingService: boolean };
type CampaignStatus = {
  campaignSid: string;
  state: "approved" | "pending" | "failed" | "unknown";
  useCase: string | null;
  error?: string;
};

const CAMPAIGN_BADGE: Record<CampaignStatus["state"], string> = {
  approved: "approved",
  pending: "pending_review",
  failed: "rejected",
  unknown: "unavailable", // couldn't reach Twilio — don't imply a carrier state
};

export default function CompliancePage() {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [numbers, setNumbers] = useState<OwnedNumber[]>([]);
  const [sending, setSending] = useState<SendingNumberStatus | null>(null);
  const [campaign, setCampaign] = useState<CampaignStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
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
    const [tfRes, numRes, statusRes] = await Promise.all([
      fetch("/api/registration/tollfree").then((r) => r.json()),
      fetch("/api/numbers").then((r) => r.json()),
      fetch("/api/compliance").then((r) => r.json()),
    ]);
    setVerifications(tfRes.verifications ?? []);
    setNumbers(numRes.numbers ?? []);
    // The tollfree GET computes `sending` after refreshing verifications, so it
    // reflects an approval that this very load discovered.
    setSending(tfRes.sending ?? numRes.sending ?? null);
    setCampaign(statusRes.campaign ?? null);
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

  async function syncNumbers() {
    setSyncing(true);
    setSyncNotice(null);
    const res = await fetch("/api/compliance", { method: "POST" });
    const data = await res.json();
    setSyncing(false);
    if (!res.ok) {
      setSyncNotice(data.error ?? "Sync failed");
    } else if (data.failed?.length) {
      setSyncNotice(
        `${data.pooled}/${data.total} pooled. Couldn't add: ` +
          data.failed.map((f: { phoneNumber: string; error: string }) => `${f.phoneNumber} (${f.error})`).join(" · ")
      );
    } else {
      setSyncNotice(`All ${data.total} number(s) are in the sending pool.`);
    }
    load();
  }

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
            <h2 className="font-extrabold text-emerald-700">
              A2P 10DLC — managed by PuffPing{campaign?.state === "approved" ? " ✓" : ""}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Your workspace sends under PuffPing&apos;s carrier-registered 10DLC campaign — no registration
              paperwork needed. Local numbers you purchase on the <span className="font-bold">Numbers</span> page
              join the sending pool automatically, and your messages always go out from your own numbers.
            </p>
          </div>
          <Badge status={campaign ? CAMPAIGN_BADGE[campaign.state] : "checking"} />
        </div>
        <div className="mt-3 grid gap-2 text-sm text-zinc-400 md:grid-cols-3">
          <div className="rounded-xl border-2 border-[color:var(--color-zinc-800)] bg-[color:var(--color-brand-cream)] px-3 py-2">
            <span className="font-bold text-zinc-300">Campaign</span>:{" "}
            {!campaign
              ? "checking…"
              : campaign.state === "unknown"
                ? "status unavailable"
                : campaign.state === "pending"
                  ? "in carrier review"
                  : campaign.state}
            {campaign?.useCase && <span className="text-zinc-500"> · {campaign.useCase.toLowerCase().replace(/_/g, " ")}</span>}
          </div>
          <div className="rounded-xl border-2 border-[color:var(--color-zinc-800)] bg-[color:var(--color-brand-cream)] px-3 py-2">
            <span className="font-bold text-zinc-300">Your numbers</span>: {numbers.length}
          </div>
          <div className="flex items-center justify-between gap-2 rounded-xl border-2 border-[color:var(--color-zinc-800)] bg-[color:var(--color-brand-cream)] px-3 py-2">
            <span>
              <span className="font-bold text-zinc-300">In sending pool</span>: {pooled}
            </span>
            {pooled < numbers.length && (
              <Button variant="ghost" onClick={syncNumbers} disabled={syncing}>
                {syncing ? "Syncing…" : "Sync numbers"}
              </Button>
            )}
          </div>
        </div>
        {/* Sending needs one of the workspace's own numbers — there's no shared-pool fallback. */}
        {sending?.canSend === false && (
          <p className="mt-3 text-sm font-bold text-amber-300">
            {sending.total === 0 ? (
              <>
                No numbers yet — your workspace can&apos;t send until it has one. Buy one on the{" "}
                <Link href="/numbers" className="underline hover:text-emerald-700">
                  Numbers
                </Link>{" "}
                page.
              </>
            ) : sending.pooled === sending.total ? (
              // Everything is pooled, so what's left is toll-free verification — on this page.
              <>
                {verifications.some((v) => v.status === "submitted" || v.status === "in_review")
                  ? `Your toll-free ${sending.total === 1 ? "number" : "numbers"} can't send until carrier verification (below) is approved.`
                  : `Toll-free numbers can't send until they pass carrier verification — use "Verify a number" below.`}{" "}
                To send right away, buy a local number on the{" "}
                <Link href="/numbers" className="underline hover:text-emerald-700">
                  Numbers
                </Link>{" "}
                page.
              </>
            ) : (
              sending.reason
            )}
          </p>
        )}
        {campaign && <p className="mt-2 font-mono text-[11px] text-zinc-500">Campaign {campaign.campaignSid}</p>}
        {syncNotice && <p className="mt-2 text-sm font-bold text-zinc-300">{syncNotice}</p>}
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
