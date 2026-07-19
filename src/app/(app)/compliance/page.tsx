"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Input, Label, PageHeader, Select, TextArea } from "@/components/ui";

type Registration = {
  id: string;
  status: string;
  currentStep: string;
  failureReason: string | null;
  legalBusinessName: string;
  messagingServiceSid: string | null;
} | null;

type Verification = { id: string; phoneNumber: string; status: string; rejectionReason: string | null };
type OwnedNumber = { twilioSid: string; phoneNumber: string; numberType: string };
type AiContent = {
  businessType: string;
  vertical: string;
  useCaseDescription: string;
  sampleMessage1: string;
  sampleMessage2: string;
  optInDescription: string;
  optInKeywords: string;
};

const BUSINESS_TYPES = ["Sole Proprietorship", "Partnership", "Limited Liability Corporation", "Corporation", "Co-operative", "Non-profit Corporation"];
const VERTICALS = ["RETAIL", "REAL_ESTATE", "HEALTHCARE", "ENERGY", "ENTERTAINMENT", "INSURANCE", "AGRICULTURE", "EDUCATION", "HOSPITALITY", "FINANCIAL", "GAMBLING", "CONSTRUCTION", "NGO", "MANUFACTURING", "GOVERNMENT", "TECHNOLOGY", "COMMUNICATION"];

// The registration is "in flight" (keep polling) for these states.
const IN_FLIGHT = ["submitting", "pending_review", "brand_approved", "campaign_pending"];

const MINIMAL_DEFAULTS = {
  legalBusinessName: "",
  ein: "",
  website: "",
  about: "",
  addressStreet: "",
  addressCity: "",
  addressState: "",
  addressPostalCode: "",
  contactFirstName: "",
  contactLastName: "",
  contactEmail: "",
  contactPhone: "",
};

export default function CompliancePage() {
  const [registration, setRegistration] = useState<Registration>(null);
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [tollfreeNumbers, setTollfreeNumbers] = useState<OwnedNumber[]>([]);
  const [form, setForm] = useState<Record<string, string>>(MINIMAL_DEFAULTS);
  const [ai, setAi] = useState<AiContent | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showTf, setShowTf] = useState(false);
  const [tfForm, setTfForm] = useState<Record<string, string>>({
    phoneNumberSid: "",
    useCaseSummary: "Marketing messages (sales, discounts, product alerts) to opted-in customers.",
    productionMessageSample: "Hi! Everything is 20% off this weekend. Reply STOP to opt out.",
    optInType: "WEB_FORM",
    messageVolume: "10,000",
  });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const [regRes, tfRes, numRes] = await Promise.all([
      fetch("/api/registration/10dlc").then((r) => r.json()),
      fetch("/api/registration/tollfree").then((r) => r.json()),
      fetch("/api/numbers").then((r) => r.json()),
    ]);
    setRegistration(regRes.registration);
    setVerifications(tfRes.verifications ?? []);
    setTollfreeNumbers((numRes.numbers ?? []).filter((n: OwnedNumber) => n.numberType === "tollfree"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Background auto-advance: while the registration is in flight, quietly poll
  // Twilio (PATCH advances the pipeline) so the user doesn't babysit it.
  useEffect(() => {
    if (registration && IN_FLIGHT.includes(registration.status)) {
      if (!pollRef.current) {
        pollRef.current = setInterval(async () => {
          const res = await fetch("/api/registration/10dlc", { method: "PATCH" });
          const data = await res.json();
          if (data.registration) setRegistration(data.registration);
        }, 20000);
      }
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [registration]);

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function previewAi() {
    if (!form.legalBusinessName.trim()) {
      setError("Enter your business name first.");
      return;
    }
    setBusy("ai");
    setError(null);
    const res = await fetch("/api/registration/10dlc/prefill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName: form.legalBusinessName, website: form.website, description: form.about }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setAi(data.content);
    setShowAdvanced(true);
  }

  async function submit() {
    setBusy("submit");
    setError(null);
    const res = await fetch("/api/registration/10dlc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, ...(ai ?? {}) }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) setError(data.error ?? data.registration?.failureReason);
    setRegistration(data.registration ?? null);
    setShowForm(false);
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
    setShowTf(false);
    load();
  }

  const field = (label: string, key: string, placeholder = "", props: Record<string, unknown> = {}) => (
    <div>
      <Label>{label}</Label>
      <Input value={form[key] ?? ""} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} {...props} />
    </div>
  );

  const registered = registration?.status === "registered";
  const failed = registration?.status === "failed";
  const inFlight = registration && IN_FLIGHT.includes(registration.status);

  return (
    <div>
      <PageHeader
        title="Compliance"
        subtitle="Fully automated A2P 10DLC — enter the minimum, AI drafts compliant messaging, and we run the whole registration in the background"
      />
      {error && <p className="mb-4 rounded-md border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">{error}</p>}

      {/* ---------- 10DLC ---------- */}
      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">A2P 10DLC registration</h2>
            <p className="mt-0.5 text-sm text-zinc-400">
              We create and submit your customer profile, brand, campaign, and messaging service — and attach your
              numbers — automatically.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {registration && <Badge status={registration.status} />}
            {(!registration || failed) && (
              <Button onClick={() => setShowForm((s) => !s)}>
                {showForm ? "Hide form" : failed ? "Fix & resubmit" : "Start registration"}
              </Button>
            )}
          </div>
        </div>

        {/* Status — only shout when there's a PROBLEM needing correction. */}
        {registered && (
          <div className="mt-3 rounded-md border border-emerald-800/50 bg-emerald-950/30 p-3 text-sm text-emerald-200">
            ✅ Registered and live. Your messaging service is ready to send.
          </div>
        )}
        {inFlight && (
          <div className="mt-3 rounded-md bg-zinc-900 p-3 text-sm text-zinc-300">
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              Working in the background — {registration!.currentStep.replace(/_/g, " ")}. You&rsquo;ll only be notified
              if something needs your input. You can leave this page.
            </span>
          </div>
        )}
        {failed && registration?.failureReason && (
          <div className="mt-3 rounded-md border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">
            <p className="font-medium">Action needed</p>
            <p className="mt-1 text-red-300/90">{registration.failureReason}</p>
          </div>
        )}
        {registration?.messagingServiceSid && (
          <p className="mt-2 text-xs text-zinc-500">
            Messaging Service: <span className="font-mono">{registration.messagingServiceSid}</span>
          </p>
        )}

        {showForm && (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-emerald-300">Your business (the only info we need)</h3>
              <div className="grid gap-3 md:grid-cols-3">
                {field("Legal business name", "legalBusinessName", "Acme Supply Co LLC")}
                {field("EIN (tax ID)", "ein", "12-3456789")}
                {field("Website", "website", "https://example.com")}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                {field("Street", "addressStreet", "123 Main St")}
                {field("City", "addressCity", "Austin")}
                {field("State", "addressState", "TX", { maxLength: 2 })}
                {field("ZIP", "addressPostalCode", "78701")}
              </div>
              <div className="mt-3">
                <Label>One line about your business (helps the AI — optional)</Label>
                <Input value={form.about} onChange={(e) => set("about", e.target.value)} placeholder="Local coffee roaster with an online store" />
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-emerald-300">Authorized contact</h3>
              <div className="grid gap-3 md:grid-cols-4">
                {field("First name", "contactFirstName")}
                {field("Last name", "contactLastName")}
                {field("Email", "contactEmail", "owner@example.com")}
                {field("Phone", "contactPhone", "(512) 555-0100")}
              </div>
            </div>

            <div className="rounded-md border border-zinc-800 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Campaign details</p>
                  <p className="text-xs text-zinc-500">
                    AI drafts a compliant use case + sample messages from your business info. Preview and edit, or just
                    submit and we&rsquo;ll handle it.
                  </p>
                </div>
                <Button variant="secondary" onClick={previewAi} disabled={busy === "ai"}>
                  {busy === "ai" ? "Drafting…" : "✨ Preview AI details"}
                </Button>
              </div>

              {showAdvanced && ai && (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Business type</Label>
                      <Select value={ai.businessType} onChange={(e) => setAi({ ...ai, businessType: e.target.value })}>
                        {BUSINESS_TYPES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>Industry</Label>
                      <Select value={ai.vertical} onChange={(e) => setAi({ ...ai, vertical: e.target.value })}>
                        {VERTICALS.map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Use case description</Label>
                    <TextArea rows={2} value={ai.useCaseDescription} onChange={(e) => setAi({ ...ai, useCaseDescription: e.target.value })} />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Sample message 1</Label>
                      <TextArea rows={3} value={ai.sampleMessage1} onChange={(e) => setAi({ ...ai, sampleMessage1: e.target.value })} />
                    </div>
                    <div>
                      <Label>Sample message 2</Label>
                      <TextArea rows={3} value={ai.sampleMessage2} onChange={(e) => setAi({ ...ai, sampleMessage2: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label>How customers opt in</Label>
                    <TextArea rows={2} value={ai.optInDescription} onChange={(e) => setAi({ ...ai, optInDescription: e.target.value })} />
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Sample messages are automatically checked for required 10DLC elements (brand name + opt-out) before
                    submission.
                  </p>
                </div>
              )}
            </div>

            <Button onClick={submit} disabled={busy === "submit"}>
              {busy === "submit" ? "Submitting to Twilio…" : "Submit & auto-register"}
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
              Verify a toll-free number for instant high throughput. Buy one on the Numbers page first; business info
              is reused from above.
            </p>
          </div>
          <Button onClick={() => setShowTf((s) => !s)}>{showTf ? "Hide form" : "Verify a number"}</Button>
        </div>

        {verifications.length > 0 && (
          <div className="mt-3 space-y-2">
            {verifications.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-md bg-zinc-900 p-3 text-sm">
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
                  {["1,000", "10,000", "100,000", "250,000", "500,000"].map((v) => (
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
              <TextArea rows={2} value={tfForm.productionMessageSample} onChange={(e) => setTfForm({ ...tfForm, productionMessageSample: e.target.value })} />
            </div>
            <p className="text-xs text-zinc-500">Business + contact details are taken from the 10DLC section above.</p>
            <Button onClick={submitTollfree} disabled={busy === "tollfree"}>
              {busy === "tollfree" ? "Submitting…" : "Submit verification"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
