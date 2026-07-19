"use client";

import { type ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-emerald-700">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border-2 border-[color:var(--color-zinc-700)] bg-zinc-900 p-4 retro-shadow ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "secondary" | "danger" | "ghost";
  disabled?: boolean;
  className?: string;
}) {
  // Chunky sticker buttons: 2px outline + hard offset shadow that presses down.
  const base =
    "retro-press inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-bold border-2 disabled:opacity-50 disabled:cursor-not-allowed";
  const styles = {
    primary:
      "bg-emerald-600 hover:bg-emerald-500 text-white border-[color:var(--color-brand-ink)] shadow-[3px_3px_0_0_var(--color-brand-ink)] active:shadow-[1px_1px_0_0_var(--color-brand-ink)]",
    secondary:
      "bg-zinc-900 hover:bg-zinc-800 text-zinc-100 border-[color:var(--color-zinc-600)] shadow-[3px_3px_0_0_rgba(196,182,141,0.7)] active:shadow-[1px_1px_0_0_rgba(196,182,141,0.7)]",
    danger:
      "bg-red-900 hover:bg-red-800 text-red-100 border-red-800 shadow-[3px_3px_0_0_rgba(179,56,47,0.5)] active:shadow-[1px_1px_0_0_rgba(179,56,47,0.5)]",
    ghost: "border-transparent hover:bg-zinc-800 text-zinc-300 shadow-none",
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

const field =
  "w-full rounded-xl border-2 border-[color:var(--color-zinc-700)] bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${field} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${field} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${field} ${props.className ?? ""}`} />;
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-zinc-500">{children}</label>;
}

const BADGE_COLORS: Record<string, string> = {
  delivered: "bg-emerald-900 text-emerald-300 border-emerald-800",
  sent: "bg-sky-900 text-sky-300 border-sky-800",
  queued: "bg-zinc-800 text-zinc-400 border-zinc-700",
  pending: "bg-zinc-800 text-zinc-400 border-zinc-700",
  sending: "bg-amber-900 text-amber-300 border-amber-800",
  failed: "bg-red-900 text-red-300 border-red-800",
  undelivered: "bg-red-900 text-red-300 border-red-800",
  received: "bg-emerald-900 text-emerald-300 border-emerald-800",
  draft: "bg-zinc-800 text-zinc-400 border-zinc-700",
  scheduled: "bg-sky-900 text-sky-300 border-sky-800",
  registered: "bg-emerald-900 text-emerald-300 border-emerald-800",
  approved: "bg-emerald-900 text-emerald-300 border-emerald-800",
  pending_review: "bg-amber-900 text-amber-300 border-amber-800",
  campaign_pending: "bg-amber-900 text-amber-300 border-amber-800",
  brand_approved: "bg-sky-900 text-sky-300 border-sky-800",
  submitted: "bg-sky-900 text-sky-300 border-sky-800",
  in_review: "bg-amber-900 text-amber-300 border-amber-800",
  rejected: "bg-red-900 text-red-300 border-red-800",
};

export function Badge({ status }: { status: string }) {
  const color = BADGE_COLORS[status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700";
  return (
    <span className={`inline-block rounded-full border-2 px-2 py-0.5 text-[11px] font-bold ${color}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-zinc-700 bg-zinc-900/60 py-14 text-center">
      <p className="text-sm font-bold text-zinc-300">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
