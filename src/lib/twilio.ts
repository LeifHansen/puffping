import Twilio from "twilio";

export function isTwilioConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

let client: Twilio.Twilio | null = null;

export function twilio(): Twilio.Twilio {
  if (!isTwilioConfigured()) {
    throw new TwilioNotConfiguredError();
  }
  if (!client) {
    client = Twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
  }
  return client;
}

class TwilioNotConfiguredError extends Error {
  constructor() {
    super(
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your environment."
    );
    this.name = "TwilioNotConfiguredError";
  }
}

/**
 * PuffPing's first carrier-approved Messaging Service (main Twilio account),
 * linked to A2P 10DLC campaign CM00d14a209e1c83c112c73c91d1e1eed5. On first
 * boot it becomes "Campaign 1" of the number-slot inventory (see
 * bootstrapCampaignFromEnv in ./slots); further campaigns are added from
 * /admin. A resource identifier, not a credential — TWILIO_MESSAGING_SERVICE_SID
 * only exists so a staging/dev Twilio account can point elsewhere.
 */
export const APPROVED_MESSAGING_SERVICE_SID = "MG1dc1a3f40c323aabf6cf26770330a6da";

/** The Messaging Service that seeds Campaign 1. */
export function campaignOneMessagingServiceSid(): string {
  return process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || APPROVED_MESSAGING_SERVICE_SID;
}

export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}
