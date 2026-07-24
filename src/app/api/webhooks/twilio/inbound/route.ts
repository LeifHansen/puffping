import { NextRequest, NextResponse } from "next/server";
import Twilio from "twilio";
import { db } from "@/lib/db";
import { recordInboundMessage } from "@/lib/inbox";
import { appBaseUrl } from "@/lib/twilio";
import { getDefaultTenantId } from "@/lib/tenant";

/**
 * Twilio inbound message webhook (set as the Messaging Service inbound URL).
 * Validates the X-Twilio-Signature header, records the message, and returns
 * empty TwiML (Advanced Opt-Out on the messaging service handles STOP/HELP
 * auto-replies at the carrier level).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));

  const signature = req.headers.get("x-twilio-signature") ?? "";
  const url = `${appBaseUrl()}/api/webhooks/twilio/inbound`;
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  // Fail CLOSED: without the auth token we can't verify authenticity, so a
  // misconfigured deploy must not accept forged inbound messages.
  if (!authToken) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  if (!Twilio.validateRequest(authToken, signature, url, params)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const numMedia = Number(params.NumMedia ?? 0);
  const mediaUrls: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const u = params[`MediaUrl${i}`];
    if (u) mediaUrls.push(u);
  }

  // Multi-tenant: route the inbound message to the tenant that owns the
  // destination (`To`) number. Falls back to the default tenant (single-tenant).
  const toNumber = params.To ?? "";
  const owned = toNumber ? await db.phoneNumber.findFirst({ where: { phoneNumber: toNumber } }) : null;
  const tenantId = owned?.tenantId ?? (await getDefaultTenantId());

  await recordInboundMessage({
    tenantId,
    from: params.From ?? "",
    body: params.Body ?? "",
    twilioSid: params.MessageSid ?? params.SmsSid ?? "",
    mediaUrls,
    numSegments: Number(params.NumSegments ?? 1),
  });

  return new NextResponse("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", {
    headers: { "Content-Type": "text/xml" },
  });
}
