import { NextRequest, NextResponse } from "next/server";
import Twilio from "twilio";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/twilio";

/**
 * Twilio delivery status callback. Updates message records so the reporting
 * dashboard reflects real delivery outcomes (sent/delivered/undelivered/failed).
 */

// Callbacks can arrive out of order — only ever advance a message's status
// (a late "sent" must not overwrite "delivered").
const STATUS_RANK: Record<string, number> = {
  queued: 1,
  accepted: 1,
  sending: 2,
  sent: 3,
  delivered: 4,
  undelivered: 4,
  failed: 4,
};

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));

  const signature = req.headers.get("x-twilio-signature") ?? "";
  const url = `${appBaseUrl()}/api/webhooks/twilio/status`;
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  // Fail CLOSED: a deploy without the auth token must not accept forged statuses.
  if (!authToken) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  if (!Twilio.validateRequest(authToken, signature, url, params)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const sid = params.MessageSid ?? params.SmsSid;
  const status = params.MessageStatus ?? params.SmsStatus;
  if (sid && status) {
    const rank = STATUS_RANK[status] ?? 0;
    const existing = await db.message.findUnique({ where: { twilioSid: sid }, select: { status: true } });
    if (existing && rank >= (STATUS_RANK[existing.status] ?? 0)) {
      await db.message.updateMany({
        where: { twilioSid: sid },
        data: {
          status,
          errorCode: params.ErrorCode || null,
          errorMessage: params.ErrorMessage || null,
        },
      });
    }
  }
  return new NextResponse(null, { status: 204 });
}
