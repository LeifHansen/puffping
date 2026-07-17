import Link from "next/link";

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/70 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          🍃 <span className="text-emerald-400">Puff</span>
          <span className="text-zinc-100">Ping</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-zinc-300 md:flex">
          <Link href="/#features" className="hover:text-white">Features</Link>
          <Link href="/#compliance" className="hover:text-white">Compliance</Link>
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="hidden text-sm text-zinc-300 hover:text-white sm:block">
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className="rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
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
    <footer className="border-t border-zinc-800/70 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-6 md:flex-row md:items-center">
        <div>
          <span className="text-base font-bold">
            🍃 <span className="text-emerald-400">Puff</span>Ping
          </span>
          <p className="mt-1 text-xs text-zinc-500">High-volume texting, done compliantly. Built on Twilio.</p>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm text-zinc-400">
          <Link href="/#features" className="hover:text-white">Features</Link>
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
          <Link href="/#compliance" className="hover:text-white">10DLC &amp; Toll-free</Link>
          <Link href="/dashboard" className="hover:text-white">Open app</Link>
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
