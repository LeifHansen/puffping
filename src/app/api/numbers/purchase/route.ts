import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isTollFree } from "@/lib/phone";
import { isTwilioConfigured, messagingServiceSid, twilio } from "@/lib/twilio";

/**
 * Purchase one or multiple numbers in a single request:
 * body = { phoneNumbers: string[] }. Each purchased number is attached to
 * the configured Messaging Service (if any) so it joins the sending pool.
 */
export async function POST(req: NextRequest) {
  if (!isTwilioConfigured()) {
    return NextResponse.json({ error: "Twilio is not configured" }, { status: 400 });
  }
  const body = await req.json();
  const phoneNumbers: string[] = Array.isArray(body.phoneNumbers) ? body.phoneNumbers : [];
  if (!phoneNumbers.length) {
    return NextResponse.json({ error: "phoneNumbers array is required" }, { status: 400 });
  }

  const client = twilio();
  const serviceSid = messagingServiceSid();
  const purchased: string[] = [];
  const failed: { phoneNumber: string; error: string }[] = [];

  for (const phoneNumber of phoneNumbers) {
    try {
      const incoming = await client.incomingPhoneNumbers.create({ phoneNumber });
      let inService = false;
      if (serviceSid) {
        try {
          await client.messaging.v1.services(serviceSid).phoneNumbers.create({ phoneNumberSid: incoming.sid });
          inService = true;
        } catch {
          // number bought but not pooled — surfaced via inMessagingService=false
        }
      }
      await db.phoneNumber.create({
        data: {
          phoneNumber: incoming.phoneNumber,
          twilioSid: incoming.sid,
          friendlyName: incoming.friendlyName,
          numberType: isTollFree(incoming.phoneNumber) ? "tollfree" : "local",
          capabilities: JSON.stringify(incoming.capabilities ?? {}),
          inMessagingService: inService,
        },
      });
      purchased.push(incoming.phoneNumber);
    } catch (err) {
      failed.push({ phoneNumber, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({ purchased, failed }, { status: failed.length && !purchased.length ? 500 : 200 });
}
