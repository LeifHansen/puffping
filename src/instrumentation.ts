/**
 * Runs once when the Next.js server boots.
 * - Ensures the default tenant exists (multi-tenant framework baseline).
 * - Resumes any campaign sends interrupted by a restart so no message is lost
 *   or double-sent.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { getDefaultTenant } = await import("./lib/tenant");
  await getDefaultTenant().catch((err) => console.error("[puffping] tenant seed failed:", err));

  const { resumePendingSends } = await import("./lib/send");
  const { isTwilioConfigured } = await import("./lib/twilio");
  if (isTwilioConfigured() && process.env.TWILIO_MESSAGING_SERVICE_SID) {
    await resumePendingSends().catch((err) => console.error("[puffping] resume failed:", err));
  }
}
