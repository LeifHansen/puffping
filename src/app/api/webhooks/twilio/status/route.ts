import { NextRequest, NextResponse } from "next/server";
import Twilio from "twilio";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/twilio";

/**
 * Twilio delivery status callback. Updates message records so the reporting
 * dashboard reflects real delivery outcomes (sent/delivered/undelivered/failed).
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw));

  const signature = req.headers.get("x-twilio-signature") ?? "";
  const url = `${appBaseUrl()}/api/webhooks/twilio/status`;
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  if (authToken && !Twilio.validateRequest(authToken, signature, url, params)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const sid = params.MessageSid ?? params.SmsSid;
  const status = params.MessageStatus ?? params.SmsStatus;
  if (sid && status) {
    await db.message.updateMany({
      where: { twilioSid: sid },
      data: {
        status,
        errorCode: params.ErrorCode || null,
        errorMessage: params.ErrorMessage || null,
      },
    });
  }
  return new NextResponse(null, { status: 204 });
}
