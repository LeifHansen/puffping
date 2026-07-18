"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, Label, PageHeader, Select, TextArea } from "@/components/ui";

type Step = { id: string; order: number; delayMinutes: number; body: string; mediaUrl: string | null };
type Automation = {
  id: string;
  name: string;
  triggerType: string;
  triggerKeyword: string | null;
  addToListId: string | null;
  enabled: boolean;
  steps: Step[];
  activeEnrollments: number;
  _count: { enrollments: number };
};
type List = { id: string; name: string };
type DraftStep = { delayMinutes: number; body: string; mediaUrl: string };

const emptyStep = (): DraftStep => ({ delayMinutes: 0, body: "", mediaUrl: "" });

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);

  // builder state
  const [name, setName] = useState("");
  const [keyword, setKeyword] = useState("");
  const [addToListId, setAddToListId] = useState("");
  const [steps, setSteps] = useState<DraftStep[]>([emptyStep()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [a, l] = await Promise.all([
      fetch("/api/automations").then((r) => r.json()),
      fetch("/api/lists").then((r) => r.json()),
    ]);
    setAutomations(a.automations ?? []);
    setLists(l.lists ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  function resetBuilder() {
    setName("");
    setKeyword("");
    setAddToListId("");
    setSteps([emptyStep()]);
    setError(null);
    setBuilding(false);
  }

  function updateStep(i: number, patch: Partial<DraftStep>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function create() {
    setError(null);
    setSaving(true);
    const res = await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        triggerType: "keyword",
        triggerKeyword: keyword,
        addToListId: addToListId || null,
        steps: steps.map((s) => ({ delayMinutes: s.delayMinutes, body: s.body, mediaUrl: s.mediaUrl || null })),
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    resetBuilder();
    load();
  }

  async function toggle(a: Automation) {
    await fetch(`/api/automations/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !a.enabled }),
    });
    load();
  }

  async function remove(a: Automation) {
    if (!confirm(`Delete automation "${a.name}"? Active drips will stop.`)) return;
    await fetch(`/api/automations/${a.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <PageHeader
        title="Automations"
        subtitle="Keyword auto-responders & drip sequences"
        actions={
          !building ? (
            <Button onClick={() => setBuilding(true)}>New automation</Button>
          ) : (
            <Button variant="secondary" onClick={resetBuilder}>
              Cancel
            </Button>
          )
        }
      />

      {building && (
        <Card className="mb-5">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Welcome series" />
            </div>
            <div>
              <Label>Trigger keyword (contacts text this)</Label>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="JOIN"
              />
            </div>
            <div>
              <Label>Also add to list (optional)</Label>
              <Select value={addToListId} onChange={(e) => setAddToListId(e.target.value)}>
                <option value="">— none —</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <Label>Message steps</Label>
            <p className="mb-2 text-xs text-zinc-500">
              Sent in order. Delay is measured from the previous step (step 1 delay is from when they
              trigger). Use {"{{first_name|there}}"} for personalization. Always include an opt-out.
            </p>
            <div className="space-y-3">
              {steps.map((s, i) => (
                <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-400">Step {i + 1}</span>
                    {steps.length > 1 && (
                      <button
                        onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-xs text-zinc-500 hover:text-red-400"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Wait</span>
                    <Input
                      type="number"
                      min={0}
                      value={s.delayMinutes}
                      onChange={(e) => updateStep(i, { delayMinutes: Number(e.target.value) })}
                      className="w-24"
                    />
                    <span className="text-xs text-zinc-500">minutes, then send:</span>
                  </div>
                  <TextArea
                    rows={2}
                    value={s.body}
                    onChange={(e) => updateStep(i, { body: e.target.value })}
                    placeholder="Hey {{first_name|there}}, thanks for joining! Reply STOP to opt out."
                  />
                  <Input
                    className="mt-2"
                    value={s.mediaUrl}
                    onChange={(e) => updateStep(i, { mediaUrl: e.target.value })}
                    placeholder="Optional MMS media URL"
                  />
                </div>
              ))}
            </div>
            <Button variant="secondary" className="mt-3" onClick={() => setSteps((prev) => [...prev, emptyStep()])}>
              + Add step
            </Button>
          </div>

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          <div className="mt-4">
            <Button onClick={create} disabled={saving}>
              {saving ? "Saving…" : "Create automation"}
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : automations.length === 0 && !building ? (
        <Card>
          <p className="text-sm text-zinc-400">
            No automations yet. Create a keyword auto-responder — e.g. contacts text{" "}
            <span className="font-mono text-emerald-400">JOIN</span> and get an instant welcome
            message plus a follow-up a day later.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {automations.map((a) => (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-zinc-100">{a.name}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        a.enabled
                          ? "bg-emerald-600/25 text-emerald-300"
                          : "bg-zinc-700/50 text-zinc-400"
                      }`}
                    >
                      {a.enabled ? "Active" : "Paused"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    Trigger: text{" "}
                    <span className="font-mono text-zinc-300">{a.triggerKeyword}</span> · {a.steps.length}{" "}
                    step{a.steps.length === 1 ? "" : "s"} · {a.activeEnrollments} in progress ·{" "}
                    {a._count.enrollments} total enrolled
                  </p>
                  <ol className="mt-2 space-y-1">
                    {a.steps.map((s, i) => (
                      <li key={s.id} className="text-xs text-zinc-400">
                        <span className="text-zinc-600">
                          {i + 1}. {s.delayMinutes > 0 ? `+${s.delayMinutes}m ` : "immediately "}
                        </span>
                        {s.body.slice(0, 90)}
                        {s.body.length > 90 ? "…" : ""}
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" onClick={() => toggle(a)}>
                    {a.enabled ? "Pause" : "Resume"}
                  </Button>
                  <Button variant="secondary" onClick={() => remove(a)}>
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
