import Link from "next/link";

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b-2 border-[color:var(--color-zinc-700)] bg-[color:var(--color-brand-cream)]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/puff-ping-logo.png" alt="PuffPing" className="h-10 w-auto mix-blend-multiply" />
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-bold text-zinc-300 md:flex">
          <Link href="/#features" className="hover:text-emerald-700">Features</Link>
          <Link href="/#compliance" className="hover:text-emerald-700">Compliance</Link>
          <Link href="/pricing" className="hover:text-emerald-700">Pricing</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="hidden text-sm font-bold text-zinc-300 hover:text-emerald-700 sm:block">
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="retro-press rounded-xl border-2 border-[color:var(--color-brand-ink)] bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white shadow-[3px_3px_0_0_var(--color-brand-ink)] active:shadow-[1px_1px_0_0_var(--color-brand-ink)]"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t-2 border-[color:var(--color-zinc-700)] py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 md:flex-row md:items-center">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/puff-ping-logo.png" alt="PuffPing" className="h-9 w-auto mix-blend-multiply" />
          <p className="mt-2 text-xs text-zinc-500">High-volume texting, done compliantly. Built on Twilio.</p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm font-bold text-zinc-400">
          <Link href="/#features" className="hover:text-emerald-700">Features</Link>
          <Link href="/pricing" className="hover:text-emerald-700">Pricing</Link>
          <Link href="/#compliance" className="hover:text-emerald-700">10DLC &amp; Toll-free</Link>
          <Link href="/privacy" className="hover:text-emerald-700">Privacy</Link>
          <Link href="/terms" className="hover:text-emerald-700">Terms</Link>
          <Link href="/dashboard" className="hover:text-emerald-700">Open app</Link>
        </div>
      </div>
      <p className="mx-auto mt-6 max-w-6xl px-6 text-[11px] text-zinc-600">
        © {new Date().getFullYear()} PuffPing. Message &amp; data rates may apply. Reply STOP to opt out.
      </p>
    </footer>
  );
}

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Header />
      {children}
      <Footer />
    </div>
  );
}
