// Node.js-runtime instrumentation (imported only from register() under the
// NEXT_RUNTIME === "nodejs" guard). Safe to use Prisma / Twilio here.
import { getDefaultTenant } from "./lib/tenant";
import { resumePendingSends } from "./lib/send";
import { ensureScheduler } from "./lib/scheduler";
import { bootstrapCampaignFromEnv } from "./lib/slots";
import { isTwilioConfigured } from "./lib/twilio";

// Ensure the default tenant exists (multi-tenant framework baseline).
await getDefaultTenant().catch((err) => console.error("[puffping] tenant seed failed:", err));

// One-time migration: the approved single Messaging Service becomes Campaign 1
// and its existing numbers get comped slots (no-op once done). Awaited so the
// worker and scheduler below see those numbers as senders from the start.
await bootstrapCampaignFromEnv().catch((err) => console.error("[puffping] campaign bootstrap failed:", err));

// Everything below needs Twilio to actually send.
if (isTwilioConfigured()) {
  // Resume any campaign sends interrupted by a restart.
  await resumePendingSends().catch((err) => console.error("[puffping] resume failed:", err));
  // Start the scheduler (scheduled campaigns, automation drips, slot reservations).
  ensureScheduler();
}
