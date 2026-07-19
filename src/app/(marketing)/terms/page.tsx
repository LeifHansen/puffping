export const metadata = {
  title: "Terms of Service — PuffPing",
  description: "The terms that govern use of PuffPing.",
};

const UPDATED = "July 2026";

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-sm text-zinc-500">Last updated: {UPDATED}</p>

      <div className="mt-4 rounded-md border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-200/80">
        Template — review with your own legal counsel before publishing. Provided as a starting point,
        not legal advice.
      </div>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-zinc-300">
        <section>
          <h2 className="text-lg font-semibold text-zinc-100">1. Acceptance</h2>
          <p>
            By creating an account or using PuffPing (the &ldquo;Service&rdquo;), you agree to these Terms. If you
            use the Service on behalf of an organization, you represent that you are authorized to bind it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100">2. Acceptable use &amp; compliance</h2>
          <p>You agree to use the Service lawfully and in compliance with all applicable messaging rules, including:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Obtaining valid consent before messaging any recipient.</li>
            <li>Honoring opt-out requests (STOP) and including required disclosures.</li>
            <li>Complying with the TCPA, CTIA guidelines, and carrier A2P 10DLC / toll-free requirements.</li>
            <li>Not sending prohibited content (the SHAFT categories: sex, hate, alcohol, firearms, tobacco), unlawful, deceptive, or high-risk content where restricted.</li>
          </ul>
          <p className="mt-2">
            You are solely responsible for the content of your messages and for your recipient lists. Violations
            may result in suspension.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100">3. Accounts</h2>
          <p>
            You are responsible for safeguarding your credentials and for all activity under your account. Notify
            us immediately of any unauthorized use.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100">4. Fees</h2>
          <p>
            Paid plans are billed as described at checkout. Carrier and messaging fees are passed through and are
            your responsibility. Fees are non-refundable except where required by law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100">5. Third-party services</h2>
          <p>
            The Service relies on third parties (e.g., Twilio) whose terms also apply to your use. We are not
            responsible for third-party outages or actions.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100">6. Disclaimers &amp; liability</h2>
          <p>
            The Service is provided &ldquo;as is&rdquo; without warranties of any kind. To the maximum extent
            permitted by law, we are not liable for indirect, incidental, or consequential damages, and our total
            liability is limited to the amounts you paid in the prior 12 months.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100">7. Termination</h2>
          <p>
            You may stop using the Service at any time. We may suspend or terminate accounts that violate these
            Terms or applicable law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100">8. Changes</h2>
          <p>We may update these Terms; continued use after changes constitutes acceptance.</p>
        </section>
      </div>
    </article>
  );
}
