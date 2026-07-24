"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, EmptyState, Input, PageHeader } from "@/components/ui";

type Conversation = {
  id: string;
  phone: string;
  lastMessageAt: string;
  lastMessageBody: string;
  unreadCount: number;
  contact: { firstName: string | null; lastName: string | null; optedOut: boolean } | null;
};
type Message = {
  id: string;
  direction: string;
  body: string;
  status: string;
  createdAt: string;
  mediaUrls: string | null;
};

/** Safe parse — one malformed row must not crash the whole inbox. */
function parseMediaUrls(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string") : [];
  } catch {
    return [];
  }
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/inbox").then((r) => r.json());
    setConversations(res.conversations ?? []);
  }, []);

  const loadThread = useCallback(async (id: string) => {
    const res = await fetch(`/api/inbox/${id}`).then((r) => r.json());
    setMessages(res.messages ?? []);
  }, []);

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 15000);
    return () => clearInterval(interval);
  }, [loadConversations]);

  useEffect(() => {
    if (!activeId) return;
    loadThread(activeId);
    const interval = setInterval(() => loadThread(activeId), 10000);
    return () => clearInterval(interval);
  }, [activeId, loadThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function sendReply() {
    if (!activeId || !reply.trim()) return;
    setError(null);
    const res = await fetch(`/api/inbox/${activeId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setReply("");
    loadThread(activeId);
  }

  const active = conversations.find((c) => c.id === activeId);

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <PageHeader title="Inbox" subtitle="Two-way conversations — replies land here in real time" />
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
        <Card className="overflow-y-auto p-0">
          {conversations.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No conversations yet" hint="Inbound replies appear here automatically." />
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`block w-full border-b border-zinc-800/60 px-4 py-3 text-left hover:bg-zinc-800/40 ${
                  activeId === c.id ? "bg-zinc-800/60" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {c.contact
                      ? [c.contact.firstName, c.contact.lastName].filter(Boolean).join(" ") || c.phone
                      : c.phone}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold">{c.unreadCount}</span>
                  )}
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-zinc-400">{c.lastMessageBody}</p>
                <p className="mt-0.5 text-[11px] text-zinc-500">{new Date(c.lastMessageAt).toLocaleString()}</p>
              </button>
            ))
          )}
        </Card>

        <Card className="flex min-h-0 flex-col lg:col-span-2">
          {!active ? (
            <div className="flex flex-1 items-center justify-center text-sm text-zinc-500">
              Select a conversation
            </div>
          ) : (
            <>
              <div className="border-b border-zinc-800 pb-2">
                <span className="font-medium">{active.phone}</span>
                {active.contact?.optedOut && (
                  <span className="ml-2 text-xs text-red-400">⚠ opted out — replies may be blocked</span>
                )}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto py-3">
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                        m.direction === "outbound" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-100"
                      }`}
                    >
                      {parseMediaUrls(m.mediaUrls).map((u) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={u} src={u} alt="MMS" className="mb-1 max-h-48 rounded-lg" />
                      ))}
                      <p className="whitespace-pre-wrap">{m.body}</p>
                      <p className="mt-0.5 text-right text-[10px] opacity-60">
                        {new Date(m.createdAt).toLocaleTimeString()} · {m.status}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              {error && <p className="mb-1 text-xs text-red-400">{error}</p>}
              <div className="flex gap-2 border-t border-zinc-800 pt-3">
                <Input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendReply()}
                  placeholder="Type a reply…"
                />
                <Button onClick={sendReply}>Send</Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
