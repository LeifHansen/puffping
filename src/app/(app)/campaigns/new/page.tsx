"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, PageHeader, Select, TextArea } from "@/components/ui";

type List = { id: string; name: string; _count: { memberships: number } };
type Template = { id: string; name: string; body: string; mediaUrl: string | null };
type Segment = { id: string; name: string; count: number };
type Preview = { audience: number; rendered: string; segments: { segments: number; encoding: string; chars: number } };

export default function NewCampaignPage() {
  const router = useRouter();
  const [lists, setLists] = useState<List[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [segmentId, setSegmentId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");

  useEffect(() => {
    fetch("/api/lists").then((r) => r.json()).then((d) => setLists(d.lists ?? []));
    fetch("/api/templates").then((r) => r.json()).then((d) => setTemplates(d.templates ?? []));
    fetch("/api/segments").then((r) => r.json()).then((d) => setSegments(d.segments ?? []));
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!body) {
        setPreview(null);
        return;
      }
      const res = await fetch("/api/campaigns/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, listIds: segmentId ? [] : selectedLists, segmentId: segmentId || null }),
      });
      if (res.ok) setPreview(await res.json());
    }, 400);
    return () => clearTimeout(t);
  }, [body, selectedLists, segmentId]);

  function toggleList(id: string) {
    setSelectedLists((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setBody(t.body);
    if (t.mediaUrl) setMediaUrl(t.mediaUrl);
  }

  async function aiAssist() {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    setError(null);
    const res = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: aiPrompt, currentDraft: body || undefined }),
    });
    const data = await res.json();
    setAiBusy(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setBody(data.variants[0]);
  }

  async function save(mode: "now" | "schedule" | "draft") {
    setError(null);
    if (mode === "schedule") {
      if (!scheduledAt) {
        setError("Pick a date & time to schedule for.");
        return;
      }
      if (new Date(scheduledAt).getTime() <= Date.now()) {
        setError("Scheduled time must be in the future.");
        return;
      }
    }
    setSaving(true);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        body,
        mediaUrl: mediaUrl || null,
        listIds: segmentId ? [] : selectedLists,
        segmentId: segmentId || null,
        // Send scheduledAt only in schedule mode; the server sets status accordingly.
        scheduledAt: mode === "schedule" ? new Date(scheduledAt).toISOString() : null,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSaving(false);
      setError(data.error);
      return;
    }
    if (mode === "now") {
      const sendRes = await fetch(`/api/campaigns/${data.campaign.id}/send`, { method: "POST" });
      if (!sendRes.ok) {
        const sendData = await sendRes.json();
        setSaving(false);
        setError(`Campaign saved as draft, but sending failed: ${sendData.error}`);
        return;
      }
    }
    router.push("/campaigns");
  }

  return (
    <div>
      <PageHeader title="New campaign" subtitle="Compose, personalize, preview, send" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Campaign name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Memorial Day Sale" />
              </div>
              <div>
                <Label>Start from template</Label>
                <Select defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
                  <option value="">— none —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="mt-3">
              <Label>Message body</Label>
              <TextArea
                rows={5}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Hi {{first_name|there}}! …  Reply STOP to opt out."
              />
            </div>
            <div className="mt-3">
              <Label>MMS media URL (optional — makes this an MMS)</Label>
              <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://…/promo.jpg" />
            </div>
            <div className="mt-3 flex items-end gap-2">
              <div className="flex-1">
                <Label>✨ AI assistant</Label>
                <Input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder='e.g. "Write a 4th of July promo for our store with 15% off code JULY15"'
                />
              </div>
              <Button variant="secondary" onClick={aiAssist} disabled={aiBusy}>
                {aiBusy ? "Generating…" : "Generate"}
              </Button>
            </div>
          </Card>

          <Card>
            {segments.length > 0 && (
              <div className="mb-3">
                <Label>Target a saved segment (optional)</Label>
                <Select value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
                  <option value="">— use lists below —</option>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.count.toLocaleString()} contacts)
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <Label>Audience — select one or more lists</Label>
            {lists.length === 0 ? (
              <p className="text-sm text-zinc-500">No lists yet. Import contacts first.</p>
            ) : (
              <div className={`mt-1 flex flex-wrap gap-2 ${segmentId ? "pointer-events-none opacity-40" : ""}`}>
                {lists.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => toggleList(l.id)}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                      selectedLists.includes(l.id)
                        ? "border-emerald-500 bg-emerald-600/30 text-emerald-200"
                        : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
                    }`}
                  >
                    {l.name} · {l._count.memberships}
                  </button>
                ))}
              </div>
            )}
            {segmentId && (
              <p className="mt-2 text-xs text-emerald-400">
                Using segment audience — list selection is ignored.
              </p>
            )}
          </Card>

          <Card>
            <Label>Schedule for later (optional)</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="max-w-xs"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Leave empty to send now or save as a draft. The scheduler fires it automatically at the
              chosen time.
            </p>
          </Card>

          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save("now")} disabled={saving}>
              {saving ? "Working…" : "Save & send now"}
            </Button>
            <Button variant="secondary" onClick={() => save("schedule")} disabled={saving}>
              Schedule
            </Button>
            <Button variant="secondary" onClick={() => save("draft")} disabled={saving}>
              Save as draft
            </Button>
          </div>
        </div>

        <div>
          <Card>
            <h3 className="mb-3 text-sm font-medium text-zinc-400">Preview</h3>
            <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-3">
              {mediaUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl} alt="MMS media" className="mb-2 max-h-40 rounded-lg object-cover" />
              )}
              <p className="whitespace-pre-wrap text-sm">
                {preview?.rendered || body || "Your message will appear here…"}
              </p>
            </div>
            {preview && (
              <dl className="mt-3 space-y-1 text-xs text-zinc-400">
                <div className="flex justify-between">
                  <dt>Audience (opted-in)</dt>
                  <dd className="font-medium text-zinc-200">{preview.audience}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Characters</dt>
                  <dd>{preview.segments.chars}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Segments ({preview.segments.encoding})</dt>
                  <dd>{preview.segments.segments}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Est. outbound segments</dt>
                  <dd>{preview.audience * preview.segments.segments}</dd>
                </div>
              </dl>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
