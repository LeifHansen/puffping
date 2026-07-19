"use client";

import { useEffect, useState } from "react";
import { Button, Card, Input, Label, PageHeader, Select, TextArea } from "@/components/ui";

type List = { id: string; name: string; _count: { memberships: number } };
type Segment = {
  id: string;
  name: string;
  count: number;
  summary: string;
  def: { listIds?: string[]; tags?: string[]; tagMatch?: string; engagement?: string | null };
};
type Suppression = { id: string; phone: string; reason: string; createdAt: string };

export default function AudiencesPage() {
  const [tab, setTab] = useState<"segments" | "suppression">("segments");
  const [lists, setLists] = useState<List[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [suppTotal, setSuppTotal] = useState(0);

  // segment builder
  const [name, setName] = useState("");
  const [pickedLists, setPickedLists] = useState<string[]>([]);
  const [tags, setTags] = useState("");
  const [tagMatch, setTagMatch] = useState("any");
  const [engagement, setEngagement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // suppression add
  const [phones, setPhones] = useState("");
  const [suppMsg, setSuppMsg] = useState<string | null>(null);

  async function loadSegments() {
    const [s, l] = await Promise.all([
      fetch("/api/segments").then((r) => r.json()),
      fetch("/api/lists").then((r) => r.json()),
    ]);
    setSegments(s.segments ?? []);
    setLists(l.lists ?? []);
  }
  async function loadSuppressions() {
    const s = await fetch("/api/suppressions").then((r) => r.json());
    setSuppressions(s.suppressions ?? []);
    setSuppTotal(s.total ?? 0);
  }
  useEffect(() => {
    loadSegments();
    loadSuppressions();
  }, []);

  async function createSegment() {
    setError(null);
    setSaving(true);
    const res = await fetch("/api/segments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        listIds: pickedLists,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        tagMatch,
        engagement: engagement || null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setName("");
    setPickedLists([]);
    setTags("");
    setEngagement("");
    loadSegments();
  }

  async function deleteSegment(id: string) {
    if (!confirm("Delete this segment?")) return;
    await fetch(`/api/segments/${id}`, { method: "DELETE" });
    loadSegments();
  }

  async function addSuppressions() {
    setSuppMsg(null);
    const res = await fetch("/api/suppressions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phones }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSuppMsg(data.error);
      return;
    }
    setSuppMsg(`Added ${data.added} to the DNC list${data.invalid ? `, ${data.invalid} invalid` : ""}.`);
    setPhones("");
    loadSuppressions();
  }

  async function removeSuppression(phone: string) {
    await fetch(`/api/suppressions?phone=${encodeURIComponent(phone)}`, { method: "DELETE" });
    loadSuppressions();
  }

  return (
    <div>
      <PageHeader title="Segments & DNC" subtitle="Saved audiences and your do-not-contact list" />

      <div className="mb-5 flex gap-2">
        <Button variant={tab === "segments" ? "primary" : "secondary"} onClick={() => setTab("segments")}>
          Segments
        </Button>
        <Button variant={tab === "suppression" ? "primary" : "secondary"} onClick={() => setTab("suppression")}>
          Suppression / DNC ({suppTotal})
        </Button>
      </div>

      {tab === "segments" ? (
        <>
          <Card className="mb-5">
            <h3 className="mb-3 text-sm font-medium text-zinc-300">New segment</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Engaged VIPs" />
              </div>
              <div>
                <Label>Engagement (optional)</Label>
                <Select value={engagement} onChange={(e) => setEngagement(e.target.value)}>
                  <option value="">Any</option>
                  <option value="clicked">Has clicked a link</option>
                  <option value="replied">Has replied</option>
                </Select>
              </div>
            </div>
            <div className="mt-3">
              <Label>In any of these lists (optional)</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {lists.length === 0 && <span className="text-sm text-zinc-500">No lists yet.</span>}
                {lists.map((l) => (
                  <button
                    key={l.id}
                    onClick={() =>
                      setPickedLists((prev) =>
                        prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id]
                      )
                    }
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                      pickedLists.includes(l.id)
                        ? "border-emerald-500 bg-emerald-600/30 text-emerald-200"
                        : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
                    }`}
                  >
                    {l.name} · {l._count.memberships}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <Label>Tags (comma-separated)</Label>
                <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vip, spring2026" />
              </div>
              <div>
                <Label>Tag match</Label>
                <Select value={tagMatch} onChange={(e) => setTagMatch(e.target.value)}>
                  <option value="any">Has any of these tags</option>
                  <option value="all">Has all of these tags</option>
                </Select>
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            <Button className="mt-4" onClick={createSegment} disabled={saving}>
              {saving ? "Saving…" : "Create segment"}
            </Button>
          </Card>

          {segments.length === 0 ? (
            <Card>
              <p className="text-sm text-zinc-400">
                No segments yet. A segment is a saved filter (lists + tags + engagement) you can target
                directly from a campaign — resolved live at send time, always excluding opted-out contacts.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {segments.map((s) => (
                <Card key={s.id}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-medium text-zinc-100">{s.name}</h3>
                      <p className="mt-1 text-xs text-zinc-500">{s.summary}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-emerald-300">{s.count.toLocaleString()} contacts</span>
                      <Button variant="ghost" onClick={() => deleteSegment(s.id)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <Card className="mb-5">
            <Label>Add phone numbers to the do-not-contact list</Label>
            <p className="mb-2 text-xs text-zinc-500">
              Paste one or many (comma, space, or newline separated). Suppressed numbers are excluded from
              every campaign and automation, and matching contacts are opted out.
            </p>
            <TextArea rows={3} value={phones} onChange={(e) => setPhones(e.target.value)} placeholder="+15551234567, +15557654321" />
            {suppMsg && <p className="mt-2 text-sm text-emerald-300">{suppMsg}</p>}
            <Button className="mt-3" onClick={addSuppressions} disabled={!phones.trim()}>
              Add to DNC
            </Button>
          </Card>

          {suppressions.length === 0 ? (
            <Card>
              <p className="text-sm text-zinc-400">No suppressed numbers. STOP replies land here automatically.</p>
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                    <th className="px-4 py-2.5 font-medium">Phone</th>
                    <th className="px-4 py-2.5 font-medium">Reason</th>
                    <th className="px-4 py-2.5 font-medium">Added</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {suppressions.map((s) => (
                    <tr key={s.id} className="border-b border-zinc-800/60 hover:bg-zinc-900/40">
                      <td className="px-4 py-2.5 font-mono text-xs">{s.phone}</td>
                      <td className="px-4 py-2.5 text-zinc-400">{s.reason}</td>
                      <td className="px-4 py-2.5 text-zinc-500">{new Date(s.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="ghost" onClick={() => removeSuppression(s.phone)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
