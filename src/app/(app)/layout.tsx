import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/campaigns", label: "Campaigns", icon: "📣" },
  { href: "/automations", label: "Automations", icon: "⚡" },
  { href: "/inbox", label: "Inbox", icon: "💬" },
  { href: "/contacts", label: "Contacts", icon: "👥" },
  { href: "/audiences", label: "Segments & DNC", icon: "🎯" },
  { href: "/media", label: "Media & Templates", icon: "🖼️" },
  { href: "/numbers", label: "Numbers", icon: "📞" },
  { href: "/compliance", label: "Compliance", icon: "✅" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r-2 border-[color:var(--color-zinc-700)] bg-zinc-900/70 px-3 py-5 flex flex-col gap-1">
        <Link href="/dashboard" className="mb-5 block px-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/puff-ping-logo.png" alt="PuffPing" className="h-11 w-auto mix-blend-multiply" />
        </Link>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-bold text-zinc-300 hover:bg-emerald-900 hover:text-emerald-800 transition-colors"
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
          </Link>
        ))}
        <div className="mt-auto border-t-2 border-[color:var(--color-zinc-700)] pt-3">
          <div className="px-2.5">
            <p className="truncate text-xs font-bold text-zinc-200">{session.tenantName}</p>
            <p className="truncate text-[11px] text-zinc-500">{session.email}</p>
          </div>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-8 py-6">{children}</main>
    </div>
  );
}
