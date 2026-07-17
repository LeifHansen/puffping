export const metadata = {
  title: "Privacy Policy — PuffPing",
  description: "How PuffPing collects, uses, and protects data.",
};

const UPDATED = "July 2026";

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-zinc-500">Last updated: {UPDATED}</p>

      <div className="mt-4 rounded-md border border-amber-800/40 bg-amber-950/20 p-3 text-xs text-amber-200/80">
        Template — review with your own legal counsel before publishing. This describes a typical
        SMS/MMS marketing platform and is provided as a starting point, not legal advice.
      </div>

      <div className="prose-invert mt-8 space-y-6 text-sm leading-relaxed text-zinc-300">
        <section>
          <h2 className="text-lg font-semibold text-zinc-100">1. Overview</h2>
          <p>
            PuffPing (&ldquo;we,&rdquo; &ldquo;us&rdquo;) provides a platform for sending SMS and MMS
            marketing messages. This policy explains what information we collect, how we use it, and the
            choices you have.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100">2. Information we collect</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Account data</strong> — your name, email, workspace name, and password (stored only as a hash).</li>
            <li><strong>Contact data you upload</strong> — phone numbers and any fields in your imported lists. You are the controller of this data; we process it on your behalf.</li>
            <li><strong>Message content &amp; metadata</strong> — the campaigns, templates, and media you create, plus delivery status and replies.</li>
            <li><strong>Usage data</strong> — logs and analytics needed to operate and secure the service.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100">3. How we use information</h2>
          <p>
            To deliver messages you send, provide the dashboard and reporting, maintain compliance
            (opt-out handling, carrier registration), secure the service, and provide support. We do not
            sell your data or your contacts&rsquo; data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100">4. Subprocessors</h2>
          <p>
            We use trusted providers to run the service, including Twilio (message delivery and carrier
            registration) and AI providers used for optional content assistance. These providers process
            data only to perform services for us.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100">5. Consent &amp; opt-out</h2>
          <p>
            You are responsible for obtaining consent from recipients before messaging them. Recipients may
            opt out at any time by replying STOP; opt-outs are honored automatically and enforced at the
            carrier level.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100">6. Data retention &amp; security</h2>
          <p>
            We retain data for as long as your account is active or as needed to provide the service and meet
            legal obligations. Passwords are hashed; access is restricted. No method of transmission or storage
            is 100% secure.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100">7. Your rights</h2>
          <p>
            Depending on your jurisdiction (e.g., GDPR, CCPA), you may have rights to access, correct, delete, or
            export your data. Contact us to exercise them.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-zinc-100">8. Contact</h2>
          <p>Questions about this policy? Contact your workspace administrator or our support team.</p>
        </section>
      </div>
    </article>
  );
}
