import Link from "next/link";

export const metadata = {
  title: "Pricing — PuffPing",
  description: "Simple per-workspace plans for high-volume SMS & MMS marketing. Carrier fees passed through at cost.",
};

const PLANS = [
  {
    name: "Starter",
    price: "$29",
    period: "/mo",
    tagline: "For a single brand getting off the ground.",
    features: [
      "Up to 5,000 contacts",
      "1 local 10DLC number",
      "SMS & MMS campaigns",
      "Two-way inbox",
      "CSV import & dynamic fields",
      "Automated 10DLC registration",
    ],
    cta: "Start Starter",
    highlight: false,
  },
  {
    name: "Growth",
    price: "$99",
    period: "/mo",
    tagline: "For teams scaling their texting program.",
    features: [
      "Up to 50,000 contacts",
      "Number pool + toll-free option",
      "AI copywriter",
      "Scheduled campaigns",
      "Delivery & engagement reporting",
      "Priority throughput",
    ],
    cta: "Start Growth",
    highlight: true,
  },
  {
    name: "Scale",
    price: "Custom",
    period: "",
    tagline: "For high-volume senders and agencies.",
    features: [
      "100,000+ contacts",
      "Multiple workspaces (multi-tenant)",
      "Dedicated number pools",
      "Toll-free + 10DLC brands",
      "SSO & role-based access",
      "White-glove onboarding",
    ],
    cta: "Contact sales",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">Simple, per-workspace pricing</h1>
        <p className="mt-3 text-zinc-400">
          Plans cover the platform. Carrier and Twilio messaging fees are passed through at cost, so you only pay
          for what you send.
        </p>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.name}
            className={`flex flex-col rounded-2xl border p-6 ${
              p.highlight
                ? "border-emerald-600/70 bg-emerald-950/20 ring-1 ring-emerald-600/30"
                : "border-zinc-800 bg-zinc-900/50"
            }`}
          >
            {p.highlight && (
              <span className="mb-3 inline-block w-fit rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                Most popular
              </span>
            )}
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="mt-1 text-sm text-zinc-400">{p.tagline}</p>
            <div className="mt-5 flex items-baseline gap-1">
              <span className="text-4xl font-bold">{p.price}</span>
              <span className="text-sm text-zinc-500">{p.period}</span>
            </div>
            <ul className="mt-6 flex-1 space-y-2.5 text-sm text-zinc-300">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <Link
              href="/dashboard"
              className={`mt-7 rounded-md px-4 py-2.5 text-center text-sm font-semibold transition-colors ${
                p.highlight
                  ? "bg-emerald-600 text-white hover:bg-emerald-500"
                  : "border border-zinc-700 text-zinc-200 hover:border-zinc-500"
              }`}
            >
              {p.cta}
            </Link>
          </div>
        ))}
      </div>

      <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-zinc-500">
        All plans include automated 10DLC / toll-free registration, opt-out compliance, and the two-way inbox.
        Multi-tenant workspaces are available on Scale.
      </p>
    </div>
  );
}
