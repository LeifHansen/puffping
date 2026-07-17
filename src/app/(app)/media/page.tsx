"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, Label, PageHeader, TextArea } from "@/components/ui";

type Asset = {
  id: string;
  kind: "image" | "video";
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  optimizedForMobile: boolean;
  altText: string | null;
  url: string;
};
type Template = { id: string; name: string; body: string; mediaUrl: string | null };

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export default function MediaPage() {
  const [tab, setTab] = useState<"library" | "templates">("library");
  return (
    <div>
      <PageHeader
        title="Media & Templates"
        subtitle="Store images and videos for MMS, optimize them for mobile, and build reusable templates"
      />
      <div className="mb-5 flex gap-1 border-b border-zinc-800">
        {(["library", "templates"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "border-emerald-500 text-white"
                : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t === "library" ? "Media library" : "Templates"}
          </button>
        ))}
      </div>
      {tab === "library" ? <Library /> : <Templates />}
    </div>
  );
}

function Library() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/media").then((r) => r.json());
    setAssets(res.assets ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function upload(file: File) {
    setUploading(true);
    setNotice(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/media", { method: "POST", body: form });
    const data = await res.json();
    setUploading(false);
    if (!res.ok) setNotice(data.error);
    load();
  }

  async function optimize(a: Asset) {
    setBusyId(a.id);
    setNotice(null);
    const res = await fetch(`/api/media/${a.id}/optimize`, { method: "POST" });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setNotice(data.error);
      return;
    }
    const parts = [`Optimized → ${kb(data.asset.sizeBytes)}`];
    if (data.savedBytes > 0) parts.push(`saved ${kb(data.savedBytes)}`);
    parts.push(data.aiUsed ? "AI-assisted" : "AI not configured — default optimization");
    if (data.warnings?.length) parts.push(`⚠ ${data.warnings.join("; ")}`);
    setNotice(parts.join(" · "));
    load();
  }

  async function remove(a: Asset) {
    if (!confirm(`Delete ${a.filename}?`)) return;
    await fetch(`/api/media/${a.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : "Upload image / video"}
        </Button>
        <span className="text-xs text-zinc-500">Images &amp; videos up to 20MB · used as MMS attachments</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = "";
          }}
        />
      </div>
      {notice && <p className="mb-3 text-sm text-emerald-300">{notice}</p>}

      {assets.length === 0 ? (
        <EmptyState title="No media yet" hint="Upload an image or video to use in MMS campaigns." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map((a) => (
            <Card key={a.id} className="flex flex-col p-0 overflow-hidden">
              <div className="flex aspect-video items-center justify-center overflow-hidden bg-zinc-950">
                {a.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.altText ?? a.filename} className="h-full w-full object-contain" />
                ) : (
                  <video src={a.url} className="h-full w-full object-contain" controls preload="metadata" />
                )}
              </div>
              <div className="flex flex-1 flex-col p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium" title={a.filename}>
                    {a.filename}
                  </p>
                  {a.optimizedForMobile && <Badge status="delivered" />}
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {a.kind} · {kb(a.sizeBytes)}
                  {a.width && a.height ? ` · ${a.width}×${a.height}` : ""}
                </p>
                {a.altText && <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">alt: {a.altText}</p>}
                <div className="mt-auto flex flex-wrap gap-1 pt-3">
                  {a.kind === "image" && !a.optimizedForMobile && (
                    <Button variant="secondary" onClick={() => optimize(a)} disabled={busyId === a.id}>
                      {busyId === a.id ? "Optimizing…" : "✨ Optimize for Mobile"}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(a.url)}>
                    Copy URL
                  </Button>
                  <Button variant="ghost" onClick={() => remove(a)}>
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

function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [images, setImages] = useState<Asset[]>([]);
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const load = useCallback(async () => {
    const [tRes, mRes] = await Promise.all([
      fetch("/api/templates").then((r) => r.json()),
      fetch("/api/media").then((r) => r.json()),
    ]);
    setTemplates(tRes.templates ?? []);
    setImages((mRes.assets ?? []).filter((a: Asset) => a.kind === "image"));
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
      <div className="mb-4">
        <Button onClick={() => setEditing({ name: "", body: "", mediaUrl: null })}>+ New template</Button>
      </div>

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
              <Label>MMS media (from library)</Label>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setPicking(true)}>
                  {editing.mediaUrl ? "Change image" : "Attach image"}
                </Button>
                {editing.mediaUrl && (
                  <Button variant="ghost" onClick={() => setEditing({ ...editing, mediaUrl: null })}>
                    Remove
                  </Button>
                )}
              </div>
              {editing.mediaUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={editing.mediaUrl} alt="attachment" className="mt-2 max-h-24 rounded-md" />
              )}
            </div>
          </div>
          <div className="mt-3">
            <Label>Message body</Label>
            <TextArea
              rows={4}
              value={editing.body ?? ""}
              onChange={(e) => setEditing({ ...editing, body: e.target.value })}
              placeholder="Hi {{first_name|there}}! … Reply STOP to opt out."
            />
          </div>
          <div className="mt-3 flex items-end gap-2">
            <div className="flex-1">
              <Label>✨ AI assistant</Label>
              <Input
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder='e.g. "flash sale with a personalized greeting"'
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

          {picking && (
            <div className="mt-4 rounded-md border border-zinc-800 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Pick an image</span>
                <Button variant="ghost" onClick={() => setPicking(false)}>
                  Close
                </Button>
              </div>
              {images.length === 0 ? (
                <p className="text-sm text-zinc-500">No images in your library yet — upload some first.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {images.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => {
                        setEditing((prev) => ({ ...(prev ?? {}), mediaUrl: img.url }));
                        setPicking(false);
                      }}
                      className="overflow-hidden rounded-md border border-zinc-700 hover:border-emerald-500"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={img.filename} className="aspect-square w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {templates.length === 0 && !editing ? (
        <EmptyState title="No templates yet" hint="Build a reusable message with an MMS image from your library." />
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
              {t.mediaUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.mediaUrl} alt="" className="mt-2 max-h-28 rounded-md" />
              )}
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">{t.body}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
