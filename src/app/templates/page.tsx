"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, EmptyState, Input, Label, PageHeader, TextArea } from "@/components/ui";

type Template = { id: string; name: string; body: string; mediaUrl: string | null; updatedAt: string };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/templates").then((r) => r.json());
    setTemplates(res.templates ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!editing) return;
    setError(null);
    const isNew = !editing.id;
    const res = await fetch(isNew ? "/api/templates" : `/api/templates/${editing.id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editing.name, body: editing.body, mediaUrl: editing.mediaUrl }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setEditing(null);
    load();
  }

  async function remove(t: Template) {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    await fetch(`/api/templates/${t.id}`, { method: "DELETE" });
    load();
  }

  async function aiAssist() {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    setError(null);
    const res = await fetch("/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: aiPrompt, currentDraft: editing?.body || undefined }),
    });
    const data = await res.json();
    setAiBusy(false);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setEditing((prev) => ({ ...(prev ?? {}), body: data.variants[0] }));
  }

  return (
    <div>
      <PageHeader
        title="Templates"
        subtitle="Reusable messages with dynamic fields like {{first_name|there}} — plus optional MMS media"
        actions={<Button onClick={() => setEditing({ name: "", body: "", mediaUrl: null })}>+ New template</Button>}
      />

      {editing && (
        <Card className="mb-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Name</Label>
              <Input
                value={editing.name ?? ""}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Weekend Sale"
              />
            </div>
            <div>
              <Label>MMS media URL (optional)</Label>
              <Input
                value={editing.mediaUrl ?? ""}
                onChange={(e) => setEditing({ ...editing, mediaUrl: e.target.value })}
                placeholder="https://…/image.jpg"
              />
            </div>
          </div>
          <div className="mt-3">
            <Label>Message body</Label>
            <TextArea
              rows={4}
              value={editing.body ?? ""}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              placeholder="Hi {{first_name|there}}! Everything is 20% off this weekend at PuffPing Supply. Reply STOP to opt out."
            />
            <p className="mt-1 text-xs text-zinc-500">
              {(editing.body ?? "").length} characters · dynamic fields: {"{{first_name}}"}, {"{{last_name}}"},{" "}
              {"{{email}}"}, plus any CSV column
            </p>
          </div>
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <Label>✨ AI assistant</Label>
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder='e.g. "Write a flash-sale message with a personalized greeting" or "make it shorter"'
              />
            </div>
            <Button variant="secondary" onClick={aiAssist} disabled={aiBusy}>
              {aiBusy ? "Generating…" : "Generate"}
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          <div className="mt-4 flex gap-2">
            <Button onClick={save}>Save template</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {templates.length === 0 && !editing ? (
        <EmptyState title="No templates yet" hint="Create reusable message templates with dynamic fields." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id}>
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">{t.name}</h3>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" onClick={() => setEditing(t)}>
                    Edit
                  </Button>
                  <Button variant="ghost" onClick={() => remove(t)}>
                    Delete
                  </Button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{t.body}</p>
              {t.mediaUrl && <p className="mt-2 truncate text-xs text-sky-400">📎 {t.mediaUrl}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
