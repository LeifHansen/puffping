"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Input, Label, PageHeader, Select, TextArea } from "@/components/ui";

type Registration = {
  id: string;
  status: string;
  currentStep: string;
  failureReason: string | null;
  legalBusinessName: string;
  messagingServiceSid: string | null;
} | null;

type Verification = {
  id: string;
  phoneNumber: string;
  status: string;
  rejectionReason: string | null;
};

type OwnedNumber = { twilioSid: string; phoneNumber: string; numberType: string };

const BUSINESS_TYPES = ["Sole Proprietorship", "Partnership", "Limited Liability Corporation", "Corporation", "Co-operative", "Non-profit Corporation"];
const VERTICALS = ["RETAIL", "REAL_ESTATE", "HEALTHCARE", "ENERGY", "ENTERTAINMENT", "INSURANCE", "AGRICULTURE", "EDUCATION", "HOSPITALITY", "FINANCIAL", "GAMBLING", "CONSTRUCTION", "NGO", "MANUFACTURING", "GOVERNMENT", "TECHNOLOGY", "COMMUNICATION"];

const TENDLC_DEFAULTS = {
  legalBusinessName: "",
  businessType: "Limited Liability Corporation",
  ein: "",
  website: "",
  addressStreet: "",
  addressCity: "",
  addressState: "",
  addressPostalCode: "",
  vertical: "RETAIL",
  contactFirstName: "",
  contactLastName: "",
  contactEmail: "",
  contactPhone: "",
  useCaseDescription:
    "Marketing and promotional messages to customers who opted in to receive texts, including sales announcements, discount codes, and new product alerts.",
  sampleMessage1:
    "Hi {{first_name}}! Everything at our shop is 20% off this weekend only. Show this text at checkout. Reply STOP to opt out.",
  sampleMessage2:
    "{{first_name}}, your favorite items are back in stock! Grab them before they're gone. Reply STOP to opt out.",
  optInDescription:
    "Customers opt in by submitting their phone number on our website signup form or by texting START to our number. The form states they consent to receive recurring marketing texts and that message/data rates apply.",
};

export default function CompliancePage() {
  const [registration, setRegistration] = useState<Registration>(null);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [tollfreeNumbers, setTollfreeNumbers] = useState<OwnedNumber[]>([]);
  const [form, setForm] = useState<Record<string, string>>(TENDLC_DEFAULTS);
  const [tfForm, setTfForm] = useState<Record<string, string>>({
    phoneNumberSid: "",
    useCaseSummary: "Marketing messages (sales, discounts, product alerts) to opted-in customers.",
    productionMessageSample: "Hi! Everything is 20% off this weekend. Reply STOP to opt out.",
    optInType: "WEB_FORM",
    messageVolume: "10,000",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTendlcForm, setShowTendlcForm] = useState(false);
  const [showTfForm, setShowTfForm] = useState(false);

  const load = useCallback(async () => {
    const [regRes, tfRes, numRes] = await Promise.all([
      fetch("/api/registration/10dlc").then((r) => r.json()),
      fetch("/api/registration/tollfree").then((r) => r.json()),
      fetch("/api/numbers").then((r) => r.json()),
    ]);
    setRegistration(regRes.registration);
    setVerifications(tfRes.verifications ?? []);
    setTollfreeNumbers(
      (numRes.numbers ?? []).filter((n: OwnedNumber & { numberType: string }) => n.numberType === "tollfree")
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function submitTendlc() {
    setBusy("10dlc");
    setError(null);
    const res = await fetch("/api/registration/10dlc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) setError(data.error ?? data.registration?.failureReason);
    setRegistration(data.registration ?? null);
    setShowTendlcForm(false);
  }

  async function refresh10dlc() {
    setBusy("refresh");
    await fetch("/api/registration/10dlc", { method: "PATCH" });
    setBusy(null);
    load();
  }

  async function submitTollfree() {
    const num = tollfreeNumbers.find((n) => n.twilioSid === tfForm.phoneNumberSid);
    if (!num) {
      setError("Select a toll-free number (buy one on the Numbers page first).");
      return;
    }
    setBusy("tollfree");
    setError(null);
    const res = await fetch("/api/registration/tollfree", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...tfForm,
        phoneNumber: num.phoneNumber,
        businessName: form.legalBusinessName,
        businessWebsite: form.website,
        addressStreet: form.addressStreet,
        addressCity: form.addressCity,
        addressState: form.addressState,
        addressPostalCode: form.addressPostalCode,
        contactFirstName: form.contactFirstName,
        contactLastName: form.contactLastName,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
      }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) setError(data.error ?? data.verification?.rejectionReason);
    setShowTfForm(false);
    load();
  }

  async function refreshTollfree(id: string) {
    await fetch("/api/registration/tollfree", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  const field = (label: string, key: string, placeholder = "", props: Record<string, unknown> = {}) => (
    <div>
      <Label>{label}</Label>
      <Input value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} {...props} />
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Compliance"
        subtitle="Fully automated A2P 10DLC and toll-free registration — we only ask for the minimum Twilio requires"
      />
      {error && <p className="mb-4 rounded-md border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">{error}</p>}

      {/* ---------- 10DLC ---------- */}
      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">A2P 10DLC registration</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              Required for high-volume texting from local numbers. One form → brand, campaign, and messaging service
              are created and submitted automatically.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {registration && <Badge status={registration.status} />}
            {registration && !["registered"].includes(registration.status) && (
              <Button variant="secondary" onClick={refresh10dlc} disabled={busy === "refresh"}>
                {busy === "refresh" ? "Checking…" : "Check status"}
              </Button>
            )}
            {(!registration || ["draft", "failed"].includes(registration.status)) && (
              <Button onClick={() => setShowTendlcForm((s) => !s)}>
                {showTendlcForm ? "Hide form" : registration ? "Fix & resubmit" : "Start registration"}
              </Button>
            )}
          </div>
        </div>

        {registration && (
          <div className="mt-3 rounded-md bg-zinc-900 p-3 text-sm">
            <p>
              <span className="text-zinc-400">Brand:</span> {registration.legalBusinessName} ·{" "}
              <span className="text-zinc-400">step:</span> {registration.currentStep.replace(/_/g, " ")}
            </p>
            {registration.messagingServiceSid && (
              <p className="mt-1 text-xs text-zinc-500">
                Messaging Service: <span className="font-mono">{registration.messagingServiceSid}</span> — set this as{" "}
                <span className="font-mono">TWILIO_MESSAGING_SERVICE_SID</span>
              </p>
            )}
            {registration.failureReason && (
              <p className="mt-1 text-xs text-red-400">{registration.failureReason}</p>
            )}
          </div>
        )}

        {showTendlcForm && (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-emerald-300">1 · Business</h3>
              <div className="grid gap-3 md:grid-cols-3">
                {field("Legal business name", "legalBusinessName", "Acme Supply Co LLC")}
                <div>
                  <Label>Business type</Label>
                  <Select value={form.businessType} onChange={(e) => set("businessType", e.target.value)}>
                    {BUSINESS_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </Select>
                </div>
                {field("EIN (tax ID)", "ein", "12-3456789")}
                {field("Website", "website", "https://example.com")}
                <div>
                  <Label>Industry</Label>
                  <Select value={form.vertical} onChange={(e) => set("vertical", e.target.value)}>
                    {VERTICALS.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                {field("Street", "addressStreet", "123 Main St")}
                {field("City", "addressCity", "Austin")}
                {field("State", "addressState", "TX", { maxLength: 2 })}
                {field("ZIP", "addressPostalCode", "78701")}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-emerald-300">2 · Authorized contact</h3>
              <div className="grid gap-3 md:grid-cols-4">
                {field("First name", "contactFirstName")}
                {field("Last name", "contactLastName")}
                {field("Email", "contactEmail", "owner@example.com")}
                {field("Phone", "contactPhone", "(512) 555-0100")}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-emerald-300">3 · Campaign (pre-filled — edit if needed)</h3>
              <Label>Use case description</Label>
              <TextArea rows={2} value={form.useCaseDescription} onChange={(e) => set("useCaseDescription", e.target.value)} />
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Sample message 1</Label>
                  <TextArea rows={3} value={form.sampleMessage1} onChange={(e) => set("sampleMessage1", e.target.value)} />
                </div>
                <div>
                  <Label>Sample message 2</Label>
                  <TextArea rows={3} value={form.sampleMessage2} onChange={(e) => set("sampleMessage2", e.target.value)} />
                </div>
              </div>
              <div className="mt-2">
                <Label>How do customers opt in?</Label>
                <TextArea rows={2} value={form.optInDescription} onChange={(e) => set("optInDescription", e.target.value)} />
              </div>
            </div>

            <Button onClick={submitTendlc} disabled={busy === "10dlc"}>
              {busy === "10dlc" ? "Submitting to Twilio…" : "Submit registration"}
            </Button>
          </div>
        )}
      </Card>

      {/* ---------- Toll-free ---------- */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Toll-free verification</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              Verify a toll-free number for high-volume texting. Buy a toll-free number on the Numbers page first —
              business info is reused from the 10DLC form above.
            </p>
          </div>
          <Button onClick={() => setShowTfForm((s) => !s)}>{showTfForm ? "Hide form" : "Verify a number"}</Button>
        </div>

        {verifications.length > 0 && (
          <div className="mt-3 space-y-2">
            {verifications.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-md bg-zinc-900 p-3 text-sm">
                <div>
                  <span className="font-mono">{v.phoneNumber}</span>
                  {v.rejectionReason && <p className="mt-0.5 text-xs text-red-400">{v.rejectionReason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge status={v.status} />
                  {!["approved"].includes(v.status) && (
                    <Button variant="ghost" onClick={() => refreshTollfree(v.id)}>
                      Refresh
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {showTfForm && (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Toll-free number</Label>
                <Select value={tfForm.phoneNumberSid} onChange={(e) => setTfForm({ ...tfForm, phoneNumberSid: e.target.value })}>
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
                <Select value={tfForm.optInType} onChange={(e) => setTfForm({ ...tfForm, optInType: e.target.value })}>
                  {["WEB_FORM", "VERBAL", "PAPER_FORM", "VIA_TEXT", "MOBILE_QR_CODE"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Monthly volume</Label>
                <Select value={tfForm.messageVolume} onChange={(e) => setTfForm({ ...tfForm, messageVolume: e.target.value })}>
                  {["1,000", "10,000", "100,000", "250,000", "500,000", "750,000", "1,000,000"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label>Use case summary</Label>
              <TextArea rows={2} value={tfForm.useCaseSummary} onChange={(e) => setTfForm({ ...tfForm, useCaseSummary: e.target.value })} />
            </div>
            <div>
              <Label>Production message sample</Label>
              <TextArea
                rows={2}
                value={tfForm.productionMessageSample}
                onChange={(e) => setTfForm({ ...tfForm, productionMessageSample: e.target.value })}
              />
            </div>
            <p className="text-xs text-zinc-500">
              Business + contact details are taken from the 10DLC section above — fill those in first if empty.
            </p>
            <Button onClick={submitTollfree} disabled={busy === "tollfree"}>
              {busy === "tollfree" ? "Submitting…" : "Submit verification"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
