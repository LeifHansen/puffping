import { NextRequest, NextResponse } from "next/server";
import Twilio from "twilio";
import { recordInboundMessage } from "@/lib/inbox";
import { appBaseUrl } from "@/lib/twilio";

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
  if (authToken && !Twilio.validateRequest(authToken, signature, url, params)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const numMedia = Number(params.NumMedia ?? 0);
  const mediaUrls: string[] = [];
  for (let i = 0; i < numMedia; i++) {
    const u = params[`MediaUrl${i}`];
    if (u) mediaUrls.push(u);
  }

  await recordInboundMessage({
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
