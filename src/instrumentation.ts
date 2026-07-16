/**
 * Runs once when the Next.js server boots. Resumes any campaign sends that
 * were interrupted by a restart so no message is lost or double-sent.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { resumePendingSends } = await import("./lib/send");
    const { isTwilioConfigured } = await import("./lib/twilio");
    if (isTwilioConfigured() && process.env.TWILIO_MESSAGING_SERVICE_SID) {
      await resumePendingSends().catch((err) => console.error("[puffping] resume failed:", err));
    }
  }
}
