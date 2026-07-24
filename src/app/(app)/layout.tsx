import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import {
  IconAutomations,
  IconCampaigns,
  IconCompliance,
  IconContacts,
  IconDashboard,
  IconInbox,
  IconMedia,
  IconNumbers,
  IconSegments,
  IconSettings,
} from "@/components/nav-icons";

const NAV = [
  { href: "/dashboard", label: "Dashboard", Icon: IconDashboard },
  { href: "/campaigns", label: "Campaigns", Icon: IconCampaigns },
  { href: "/automations", label: "Automations", Icon: IconAutomations },
  { href: "/inbox", label: "Inbox", Icon: IconInbox },
  { href: "/contacts", label: "Contacts", Icon: IconContacts },
  { href: "/audiences", label: "Segments & DNC", Icon: IconSegments },
  { href: "/media", label: "Media & Templates", Icon: IconMedia },
  { href: "/numbers", label: "Numbers", Icon: IconNumbers },
  { href: "/compliance", label: "Compliance", Icon: IconCompliance },
  { href: "/settings", label: "Settings", Icon: IconSettings },
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
        {NAV.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-bold text-zinc-300 hover:bg-emerald-900 hover:text-emerald-800 transition-colors"
          >
            <Icon className="shrink-0 text-emerald-700 transition-colors group-hover:text-emerald-800" />
            {label}
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
