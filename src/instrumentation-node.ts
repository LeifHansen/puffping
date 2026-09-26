// Node.js-runtime instrumentation (imported only from register() under the
// NEXT_RUNTIME === "nodejs" guard). Safe to use Prisma / Twilio here.
import { getDefaultTenant } from "./lib/tenant";
import { resumePendingSends } from "./lib/send";
import { ensureScheduler } from "./lib/scheduler";
import { getPlatformCampaignStatus, syncSendingPool } from "./lib/platform-10dlc";
import { a2pCampaignSid, isTwilioConfigured, messagingServiceSid } from "./lib/twilio";

// Ensure the default tenant exists (multi-tenant framework baseline).
await getDefaultTenant().catch((err) => console.error("[puffping] tenant seed failed:", err));

const POOL_SYNC_BOOT_TIMEOUT_MS = 30_000;

// Everything below needs Twilio to actually send.
if (isTwilioConfigured()) {
  // Non-blocking boot checks: report the platform campaign's carrier status.
  void getPlatformCampaignStatus().then((s) =>
    console.log(
      `[puffping] A2P campaign ${a2pCampaignSid()} on ${messagingServiceSid()}: ${s.twilioStatus ?? `unavailable (${s.error})`}`
    )
  );

  // Pool any purchased numbers that aren't in the sender pool yet, THEN start
  // the send worker and scheduler: a workspace whose only number just needs
  // re-pooling can't send, so starting them first would fail its queued rows
  // and due campaigns seconds before the sync fixes it. Runs off the boot path
  // (the server starts serving meanwhile), and a hung Twilio call can't hold
  // the worker back for more than the timeout.
  const sync = syncSendingPool()
    .then((r) => {
      if (r.attached || r.failed.length) {
        console.log(`[puffping] sender pool sync: ${r.pooled}/${r.total} pooled, ${r.attached} newly attached`, r.failed);
      }
    })
    .catch((err) => console.error("[puffping] sender pool sync failed:", err));
  const timeout = new Promise((resolve) => setTimeout(resolve, POOL_SYNC_BOOT_TIMEOUT_MS).unref());
  void Promise.race([sync, timeout]).then(async () => {
    // Resume any campaign sends interrupted by a restart.
    await resumePendingSends().catch((err) => console.error("[puffping] resume failed:", err));
    // Start the scheduler (scheduled campaigns, automation drips, toll-free polls).
    ensureScheduler();
  });
}
