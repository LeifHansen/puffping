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

export class TwilioNotConfiguredError extends Error {
  constructor() {
    super(
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your environment."
    );
    this.name = "TwilioNotConfiguredError";
  }
}

export function messagingServiceSid(): string | undefined {
  return process.env.TWILIO_MESSAGING_SERVICE_SID || undefined;
}

export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}
