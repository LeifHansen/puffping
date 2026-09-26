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
 * PuffPing's carrier-approved A2P 10DLC campaign and the Messaging Service it
 * is linked to (main Twilio account). Every workspace sends under this one
 * campaign; purchased numbers join the service's sender pool. These are
 * resource identifiers, not credentials — the env vars only exist so a
 * staging/dev Twilio account can point elsewhere.
 */
export const APPROVED_MESSAGING_SERVICE_SID = "MG1dc1a3f40c323aabf6cf26770330a6da";
export const APPROVED_A2P_CAMPAIGN_SID = "CM00d14a209e1c83c112c73c91d1e1eed5";

/** The Messaging Service every send goes through. */
export function messagingServiceSid(): string {
  return process.env.TWILIO_MESSAGING_SERVICE_SID || APPROVED_MESSAGING_SERVICE_SID;
}

/** The A2P 10DLC campaign registered on {@link messagingServiceSid}. */
export function a2pCampaignSid(): string {
  return process.env.TWILIO_A2P_CAMPAIGN_SID || APPROVED_A2P_CAMPAIGN_SID;
}

export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}
