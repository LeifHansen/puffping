"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, EmptyState, Input, Label, PageHeader, Select } from "@/components/ui";

type List = { id: string; name: string; _count: { memberships: number } };
type Contact = {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  optedOut: boolean;
  memberships: { list: { id: string; name: string } }[];
  tagLinks: { tag: string }[];
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [listFilter, setListFilter] = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [newListName, setNewListName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (listFilter) params.set("listId", listFilter);
    const [cRes, lRes] = await Promise.all([
      fetch(`/api/contacts?${params}`).then((r) => r.json()),
      fetch("/api/lists").then((r) => r.json()),
    ]);
    setContacts(cRes.contacts ?? []);
    setTotal(cRes.total ?? 0);
    setLists(lRes.lists ?? []);
  }, [q, listFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleImport(file: File) {
    setImporting(true);
    setImportResult(null);
    const form = new FormData();
    form.append("file", file);
    if (listFilter) form.append("listId", listFilter);
    else if (newListName.trim()) form.append("listName", newListName.trim());
    const res = await fetch("/api/contacts/import", { method: "POST", body: form });
    const data = await res.json();
    setImporting(false);
    if (!res.ok) {
      setImportResult(`Import failed: ${data.error}`);
      return;
    }
    setImportResult(
      `Imported ${data.imported} new, updated ${data.updated}, skipped ${data.invalidCount} invalid phone numbers.`
    );
    setNewListName("");
    load();
  }

  async function createList() {
    const name = prompt("List name:");
    if (!name?.trim()) return;
    await fetch("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    load();
  }

  async function toggleOptOut(c: Contact) {
    await fetch(`/api/contacts/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optedOut: !c.optedOut }),
    });
    load();
  }

  async function editTags(c: Contact) {
    const current = c.tagLinks.map((t) => t.tag).join(", ");
    const next = prompt(`Tags for ${c.phone} (comma-separated):`, current);
    if (next === null) return;
    await fetch(`/api/contacts/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: next.split(",").map((t) => t.trim()).filter(Boolean) }),
    });
    load();
  }

  async function removeContact(c: Contact) {
    if (!confirm(`Delete ${c.phone}?`)) return;
    await fetch(`/api/contacts/${c.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle={`${total} contacts · phone numbers auto-formatted to E.164 on import`}
        actions={
          <>
            <Button variant="secondary" onClick={createList}>
              + New list
            </Button>
            <Button onClick={() => fileRef.current?.click()} disabled={importing}>
              {importing ? "Importing…" : "Import CSV"}
            </Button>
          </>
        }
      />

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImport(f);
          e.target.value = "";
        }}
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64">
            <Label>Search</Label>
            <Input placeholder="Name, phone, or email…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="w-56">
            <Label>List</Label>
            <Select value={listFilter} onChange={(e) => setListFilter(e.target.value)}>
              <option value="">All lists</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l._count.memberships})
                </option>
              ))}
            </Select>
          </div>
          <div className="w-64">
            <Label>Import into new list (optional)</Label>
            <Input
              placeholder="e.g. Spring VIPs"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
            />
          </div>
        </div>
        {importResult && <p className="mt-3 text-sm text-emerald-300">{importResult}</p>}
      </Card>

      {contacts.length === 0 ? (
        <EmptyState
          title="No contacts yet"
          hint="Import a CSV — the phone column is auto-detected and numbers are formatted automatically. Extra columns become dynamic fields."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="px-4 py-2.5 font-medium">Phone</th>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Lists</th>
                <th className="px-4 py-2.5 font-medium">Tags</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-zinc-800/60 hover:bg-zinc-900/40">
                  <td className="px-4 py-2.5 font-mono text-xs">{c.phone}</td>
                  <td className="px-4 py-2.5">{[c.firstName, c.lastName].filter(Boolean).join(" ") || "—"}</td>
                  <td className="px-4 py-2.5 text-zinc-400">{c.email || "—"}</td>
                  <td className="px-4 py-2.5 text-zinc-400">
                    {c.memberships.map((m) => m.list.name).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {c.tagLinks.length ? (
                      <span className="flex flex-wrap gap-1">
                        {c.tagLinks.map((t) => (
                          <span key={t.tag} className="rounded-full bg-emerald-600/20 px-2 py-0.5 text-[11px] text-emerald-300">
                            {t.tag}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge status={c.optedOut ? "failed" : "delivered"} />
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <Button variant="ghost" onClick={() => editTags(c)}>
                      Tag
                    </Button>
                    <Button variant="ghost" onClick={() => toggleOptOut(c)}>
                      {c.optedOut ? "Opt in" : "Opt out"}
                    </Button>
                    <Button variant="ghost" onClick={() => removeContact(c)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
