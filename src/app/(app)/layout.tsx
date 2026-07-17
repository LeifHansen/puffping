import Link from "next/link";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/campaigns", label: "Campaigns", icon: "📣" },
  { href: "/inbox", label: "Inbox", icon: "💬" },
  { href: "/contacts", label: "Contacts", icon: "👥" },
  { href: "/templates", label: "Templates", icon: "📝" },
  { href: "/numbers", label: "Numbers", icon: "📞" },
  { href: "/compliance", label: "Compliance", icon: "✅" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-zinc-800 bg-zinc-900/60 px-3 py-5 flex flex-col gap-1">
        <Link href="/" className="mb-4 px-2 text-lg font-bold tracking-tight">
          🍃 <span className="text-emerald-400">Puff</span>
          <span className="text-zinc-100">Ping</span>
        </Link>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        ))}
        <div className="mt-auto px-2.5 text-[11px] leading-relaxed text-zinc-500">
          High-volume texting,
          <br />
          fully compliant.
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-8 py-6">{children}</main>
    </div>
  );
}
