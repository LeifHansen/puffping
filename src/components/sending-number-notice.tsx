"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SendingNumberStatus } from "@/lib/send";

export type { SendingNumberStatus };

/** API error `code` for "no number to send from" (mirrors NO_SENDING_NUMBER in src/lib/send.ts). */
export const NO_SENDING_NUMBER = "NO_SENDING_NUMBER";

/**
 * Whether this workspace can send, from GET /api/numbers. A workspace must own a
 * registered number on a paid slot — there's no shared fallback. `status` is null until
 * the first load lands, or when the fetch fails: treat that as unknown and don't
 * block the UI (the API refuses sends without a number regardless). Re-checks on
 * window focus, so buying a number in another tab clears the block.
 */
export function useSendingStatus() {
  const [status, setStatus] = useState<SendingNumberStatus | null>(null);
  const [loading, setLoading] = useState(true);
  // Only the newest request may land, so a slow older response can't win.
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const req = ++latest.current;
    let next: SendingNumberStatus | null = null;
    try {
      const res = await fetch("/api/numbers");
      if (res.ok) next = (await res.json()).sending ?? null;
    } catch {
      // offline or bad response — status unknown
    }
    if (req !== latest.current) return;
    setStatus(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [reload]);

  return { status, loading, reload };
}

/**
 * Amber callout explaining why this workspace can't send and where to fix it.
 * Renders nothing when it can send, or while the status is unknown.
 */
export function SendingNumberNotice({
  status,
  className = "",
}: {
  status: SendingNumberStatus | null;
  className?: string;
}) {
  if (!status || status.canSend) return null;
  // Every fix (buy a slot, claim a number, check registration or billing)
  // lives on the Numbers page.
  const cta = status.total === 0 ? "Buy a number slot" : "Go to Numbers";
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-amber-800 bg-amber-900 p-4 shadow-[4px_4px_0_0_rgba(152,103,19,0.25)] ${className}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-zinc-100">
          <span className="text-amber-300" aria-hidden>
            ⚠
          </span>{" "}
          This workspace can&apos;t send messages yet
        </p>
        <p className="mt-0.5 text-sm text-zinc-300">{status.reason}</p>
      </div>
      <Link
        href="/numbers"
        className="retro-press inline-flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-[color:var(--color-brand-ink)] bg-emerald-600 px-3.5 py-1.5 text-sm font-bold text-white shadow-[3px_3px_0_0_var(--color-brand-ink)] hover:bg-emerald-500 active:shadow-[1px_1px_0_0_var(--color-brand-ink)]"
      >
        {cta} →
      </Link>
    </div>
  );
}
