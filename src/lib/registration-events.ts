import { db } from "./db";
import { appBaseUrl, twilio } from "./twilio";

/**
 * A2P 10DLC number registration events (Twilio Event Streams).
 *
 * Adding a number to a campaign's Messaging Service kicks off carrier
 * registration; Twilio reports progress as CloudEvents:
 *   com.twilio.messaging.compliance.number-registration.{pending,successful,failed}
 * We flip PhoneNumber.status accordingly — `active` is what lets it send.
 */

export const NUMBER_REGISTRATION_EVENT_TYPES = [
  "com.twilio.messaging.compliance.number-registration.pending",
  "com.twilio.messaging.compliance.number-registration.successful",
  "com.twilio.messaging.compliance.number-registration.failed",
];
const EVENT_PREFIX = "com.twilio.messaging.compliance.number-registration.";

export function registrationEventsUrl(): string {
  return `${appBaseUrl()}/api/webhooks/twilio/events`;
}

type CloudEvent = { type?: string; data?: unknown };

/** Collect Twilio phone-number SIDs (PN…) and E.164 numbers anywhere in an event payload. */
function identifiers(data: unknown): { sids: string[]; numbers: string[] } {
  const sids = new Set<string>();
  const numbers = new Set<string>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 6 || v == null) return;
    if (typeof v === "string") {
      if (/^PN[0-9a-f]{32}$/i.test(v)) sids.add(v);
      else if (/^\+1\d{10}$/.test(v)) numbers.add(v);
    } else if (Array.isArray(v)) {
      v.forEach((x) => walk(x, depth + 1));
    } else if (typeof v === "object") {
      Object.values(v as Record<string, unknown>).forEach((x) => walk(x, depth + 1));
    }
  };
  walk(data, 0);
  return { sids: [...sids], numbers: [...numbers] };
}

function failureReason(data: unknown): string {
  const d = (data ?? {}) as Record<string, unknown>;
  const reason = d.failure_reason ?? d.failureReason ?? d.reason ?? d.error_message ?? d.errors ?? d.error_code;
  if (!reason) return "Carrier registration failed — see the Twilio console";
  return (typeof reason === "string" ? reason : JSON.stringify(reason)).slice(0, 500);
}

/** Apply one or more Event Streams events. Returns how many numbers changed. */
export async function applyRegistrationEvents(events: CloudEvent[]): Promise<number> {
  let changed = 0;
  for (const event of events) {
    if (!event.type?.startsWith(EVENT_PREFIX)) continue;
    const outcome = event.type.slice(EVENT_PREFIX.length);
    const { sids, numbers } = identifiers(event.data);
    if (!sids.length && !numbers.length) {
      console.error(`[puffping] ${event.type} event without a phone number identifier:`, JSON.stringify(event.data));
      continue;
    }
    const where = { OR: [{ twilioSid: { in: sids } }, { phoneNumber: { in: numbers } }] };

    if (outcome === "successful") {
      const res = await db.phoneNumber.updateMany({ where, data: { status: "active", registrationError: null } });
      changed += res.count;
    } else if (outcome === "failed") {
      const res = await db.phoneNumber.updateMany({
        where,
        data: { status: "registration_failed", registrationError: failureReason(event.data) },
      });
      changed += res.count;
    } else if (outcome === "pending") {
      // Only a retry after a failure moves back to pending; a late "pending"
      // must never un-register an active number (events can arrive out of order).
      const res = await db.phoneNumber.updateMany({
        where: { ...where, status: "registration_failed" },
        data: { status: "pending_registration", registrationError: null },
      });
      changed += res.count;
    }
  }
  return changed;
}

/**
 * Idempotently create the Event Streams webhook sink pointing at this app and
 * subscribe it to the number-registration events (platform admin action).
 */
export async function ensureRegistrationEventStream(): Promise<{ sinkSid: string; sinkStatus: string; created: boolean }> {
  const client = twilio();
  const destination = registrationEventsUrl();
  let created = false;

  const sinks = await client.events.v1.sinks.list({ limit: 200 });
  let sink = sinks.find(
    (s) => s.sinkType === "webhook" && (s.sinkConfiguration as { destination?: string } | null)?.destination === destination
  );
  if (!sink) {
    sink = await client.events.v1.sinks.create({
      description: "PuffPing number registration events",
      sinkType: "webhook",
      sinkConfiguration: { destination, method: "POST", batch_events: false },
    });
    created = true;
  }

  const subscriptions = await client.events.v1.subscriptions.list({ sinkSid: sink.sid, limit: 50 });
  if (!subscriptions.length) {
    await client.events.v1.subscriptions.create({
      description: "PuffPing A2P 10DLC number registration",
      sinkSid: sink.sid,
      types: NUMBER_REGISTRATION_EVENT_TYPES.map((type) => ({ type })),
    });
    created = true;
  }
  return { sinkSid: sink.sid, sinkStatus: String(sink.status), created };
}
