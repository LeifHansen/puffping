import Link from "next/link";

export const metadata = {
  title: "PuffPing — High-volume SMS & MMS marketing that stays compliant",
  description:
    "Launch mass text campaigns to hundreds or 100,000+ contacts. Automated 10DLC & toll-free registration, MMS, a two-way inbox, dynamic fields, AI copy, and reporting.",
};

const FEATURES = [
  {
    icon: "📣",
    title: "Campaigns at scale",
    body: "Blast hundreds or 100,000+ contacts. Messages enqueue instantly and a durable worker drains the queue with rate-limit backoff — no lost or double-sent texts.",
  },
  {
    icon: "🖼️",
    title: "SMS & MMS",
    body: "Send plain texts or rich MMS with images. Live preview shows exactly how each message renders, with segment and encoding estimates.",
  },
  {
    icon: "🧩",
    title: "Dynamic fields",
    body: "Personalize with {{first_name|there}} and any column from your CSV. Fallbacks keep every message clean, even when data is missing.",
  },
  {
    icon: "📥",
    title: "CSV import",
    body: "Drop in any contact file. Phone columns are auto-detected, numbers auto-format to E.164, duplicates dedupe, and extra columns become dynamic fields.",
  },
  {
    icon: "💬",
    title: "Two-way inbox",
    body: "Replies land in a threaded inbox in real time. Respond with SMS or MMS, track unread counts, and honor STOP/START opt-outs automatically.",
  },
  {
    icon: "✨",
    title: "AI copywriter",
    body: "Draft and refine high-converting, carrier-compliant copy in one click — brand name and opt-out language included by default.",
  },
  {
    icon: "📞",
    title: "Number shopping",
    body: "Search and buy local or toll-free numbers — one or many at once. New numbers join your sending pool automatically.",
  },
  {
    icon: "📊",
    title: "Reporting dashboard",
    body: "Delivery, reply, and opt-out rates plus a 30-day volume trend, fed by real carrier delivery receipts.",
  },
];

const STEPS = [
  { n: "1", title: "Register", body: "Complete automated 10DLC or toll-free verification with the minimum info carriers require." },
  { n: "2", title: "Import", body: "Upload your contacts. Numbers are cleaned and formatted; lists organize your audience." },
  { n: "3", title: "Compose", body: "Write with dynamic fields or let AI draft it. Preview segments and audience size live." },
  { n: "4", title: "Send & track", body: "Blast at scale and watch delivery, replies, and opt-outs roll in on the dashboard." },
];

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(44rem 26rem at 72% -12%, rgba(16,185,129,0.12), transparent 62%)",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-16 text-center md:pt-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-800/60 bg-emerald-950/40 px-3 py-1 text-xs font-medium text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Fully automated 10DLC &amp; toll-free registration
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            Mass texting that actually
            <span className="text-emerald-400"> lands</span> — and stays compliant.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-zinc-400">
            PuffPing sends SMS &amp; MMS campaigns to hundreds or 100,000+ contacts, with a two-way inbox,
            dynamic personalization, AI copy, and carrier registration handled for you.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
            >
              Get started free
            </Link>
            <Link
              href="/pricing"
              className="rounded-md border border-zinc-700 px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500 transition-colors"
            >
              See pricing
            </Link>
          </div>
          <p className="mt-4 text-xs text-zinc-500">No credit card to start · Built on Twilio</p>

          {/* Stat strip */}
          <div className="mx-auto mt-14 grid max-w-3xl grid-cols-3 gap-4">
            {[
              ["100k+", "contacts per blast"],
              ["2-way", "real-time inbox"],
              ["10DLC", "auto-registered"],
            ].map(([stat, label]) => (
              <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-5">
                <div className="text-2xl font-bold text-emerald-400 md:text-3xl">{stat}</div>
                <div className="mt-1 text-xs text-zinc-400">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Everything you need to run a texting program</h2>
          <p className="mt-3 text-zinc-400">
            From carrier registration to the send button to the reply — one platform, no glue code.
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition-colors hover:border-emerald-800/60"
            >
              <div className="text-2xl" aria-hidden>{f.icon}</div>
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-zinc-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Compliance highlight */}
      <section id="compliance" className="border-y border-zinc-800/70 bg-zinc-900/30">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-20 md:grid-cols-2">
          <div>
            <span className="text-sm font-semibold text-emerald-400">Compliance, automated</span>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">
              10DLC &amp; toll-free registration without the paperwork maze
            </h2>
            <p className="mt-4 text-zinc-400">
              High-volume texting requires carrier registration. PuffPing asks for only the minimum info the
              carriers require, then creates and submits everything for you — the customer profile, A2P brand,
              campaign, and messaging service — and tracks approval end to end.
            </p>
            <ul className="mt-6 space-y-2.5 text-sm text-zinc-300">
              {[
                "One short form → full A2P 10DLC brand + campaign",
                "Toll-free verification for instant high throughput",
                "STOP / HELP auto-replies and opt-out enforcement built in",
                "Resumable pipeline — pick up right where carrier review left off",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6">
            <div className="space-y-3">
              {[
                ["Customer profile", "approved"],
                ["A2P brand registration", "approved"],
                ["Campaign use case", "verified"],
                ["Messaging service", "live"],
              ].map(([label, state]) => (
                <div key={label} className="flex items-center justify-between rounded-lg bg-zinc-900/70 px-4 py-3">
                  <span className="text-sm text-zinc-300">{label}</span>
                  <span className="rounded-full border border-emerald-800 bg-emerald-950/50 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                    {state}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Live in four steps</h2>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
                {s.n}
              </div>
              <h3 className="mt-3 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm text-zinc-400">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-2xl border border-emerald-800/40 bg-gradient-to-br from-emerald-950/60 to-zinc-900 px-8 py-14 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Ready to send your first blast?</h2>
          <p className="mx-auto mt-3 max-w-xl text-zinc-400">
            Spin up a workspace, import your list, and reach every customer in minutes.
          </p>
          <Link
            href="/dashboard"
            className="mt-7 inline-block rounded-md bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
          >
            Open the app
          </Link>
        </div>
      </section>
    </div>
  );
}
