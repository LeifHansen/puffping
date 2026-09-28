import { NextRequest, NextResponse } from "next/server";
import Twilio from "twilio";
import { applyRegistrationEvents, registrationEventsUrl } from "@/lib/registration-events";

/**
 * Twilio Event Streams webhook sink: A2P 10DLC number registration events.
 * A claimed number starts `pending_registration`; the "successful" event makes
 * it `active` (able to send). Validates X-Twilio-Signature and fails closed.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  if (!authToken) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const signature = req.headers.get("x-twilio-signature") ?? "";
  const url = `${registrationEventsUrl()}${req.nextUrl.search}`;
  // JSON bodies are signed via a bodySHA256 query param when Twilio adds one;
  // otherwise the signature covers the URL alone.
  const valid = req.nextUrl.searchParams.has("bodySHA256")
    ? Twilio.validateRequestWithBody(authToken, signature, url, raw)
    : Twilio.validateRequest(authToken, signature, url, {});
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  const events = (Array.isArray(payload) ? payload : [payload]) as { type?: string; data?: unknown }[];

  try {
    await applyRegistrationEvents(events);
  } catch (err) {
    console.error("[puffping] registration event handling failed:", err);
    return NextResponse.json({ error: "Event handling failed" }, { status: 500 }); // Twilio retries
  }
  return new NextResponse(null, { status: 204 });
}
