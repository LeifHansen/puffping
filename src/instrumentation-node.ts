// Node.js-runtime instrumentation (imported only from register() under the
// NEXT_RUNTIME === "nodejs" guard). Safe to use Prisma / Twilio here.
import { getDefaultTenant } from "./lib/tenant";
import { resumePendingSends } from "./lib/send";
import { isTwilioConfigured } from "./lib/twilio";

// Ensure the default tenant exists (multi-tenant framework baseline).
await getDefaultTenant().catch((err) => console.error("[puffping] tenant seed failed:", err));

// Resume any campaign sends interrupted by a restart.
if (isTwilioConfigured() && process.env.TWILIO_MESSAGING_SERVICE_SID) {
  await resumePendingSends().catch((err) => console.error("[puffping] resume failed:", err));
}
