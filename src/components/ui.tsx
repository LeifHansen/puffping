"use client";

import { type ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 ${className}`}>{children}</div>
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
  const styles = {
    primary: "bg-emerald-600 hover:bg-emerald-500 text-white",
    secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700",
    danger: "bg-red-900/60 hover:bg-red-800 text-red-100 border border-red-800",
    ghost: "hover:bg-zinc-800 text-zinc-300",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none ${props.className ?? ""}`}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none ${props.className ?? ""}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none ${props.className ?? ""}`}
    />
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-zinc-400">{children}</label>;
}

const BADGE_COLORS: Record<string, string> = {
  delivered: "bg-emerald-900/50 text-emerald-300 border-emerald-800",
  sent: "bg-sky-900/50 text-sky-300 border-sky-800",
  queued: "bg-zinc-800 text-zinc-300 border-zinc-700",
  pending: "bg-zinc-800 text-zinc-300 border-zinc-700",
  sending: "bg-amber-900/50 text-amber-300 border-amber-800",
  failed: "bg-red-900/50 text-red-300 border-red-800",
  undelivered: "bg-red-900/50 text-red-300 border-red-800",
  received: "bg-emerald-900/50 text-emerald-300 border-emerald-800",
  draft: "bg-zinc-800 text-zinc-300 border-zinc-700",
  scheduled: "bg-sky-900/50 text-sky-300 border-sky-800",
  registered: "bg-emerald-900/50 text-emerald-300 border-emerald-800",
  approved: "bg-emerald-900/50 text-emerald-300 border-emerald-800",
  pending_review: "bg-amber-900/50 text-amber-300 border-amber-800",
  campaign_pending: "bg-amber-900/50 text-amber-300 border-amber-800",
  brand_approved: "bg-sky-900/50 text-sky-300 border-sky-800",
  submitted: "bg-sky-900/50 text-sky-300 border-sky-800",
  in_review: "bg-amber-900/50 text-amber-300 border-amber-800",
  rejected: "bg-red-900/50 text-red-300 border-red-800",
};

export function Badge({ status }: { status: string }) {
  const color = BADGE_COLORS[status] ?? "bg-zinc-800 text-zinc-300 border-zinc-700";
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${color}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-800 py-14 text-center">
      <p className="text-sm text-zinc-400">{title}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}
