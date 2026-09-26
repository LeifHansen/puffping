import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isTollFree, normalizePhone } from "@/lib/phone";
import { invalidateSenderCache } from "@/lib/send";
import { isTwilioConfigured, messagingServiceSid, twilio } from "@/lib/twilio";
import { currentTenantId } from "@/lib/tenant";

/**
 * Purchase one or multiple numbers in a single request:
 * body = { phoneNumbers: string[] }. Each purchased number is attached to
 * PuffPing's approved Messaging Service so it joins the sending pool (and the
 * workspace's sends are pinned to it — see pickSender in lib/send).
 */
export async function POST(req: NextRequest) {
  if (!isTwilioConfigured()) {
    return NextResponse.json({ error: "Twilio is not configured" }, { status: 400 });
  }
  const body = await req.json();
  const rawNumbers: string[] = Array.isArray(body.phoneNumbers) ? body.phoneNumbers : [];
  // Normalize to E.164 before anything reaches Twilio; drop garbage input.
  const phoneNumbers = [...new Set(rawNumbers.map((p) => normalizePhone(String(p))).filter((p): p is string => !!p))];
  if (!phoneNumbers.length) {
    return NextResponse.json({ error: "phoneNumbers array is required (E.164)" }, { status: 400 });
  }

  const tenantId = await currentTenantId(req);
  const client = twilio();
  const serviceSid = messagingServiceSid();
  const purchased: string[] = [];
  const failed: { phoneNumber: string; error: string }[] = [];

  for (const phoneNumber of phoneNumbers) {
    // Twilio purchase and DB bookkeeping are separated: once Twilio has charged
    // and provisioned the number, a DB hiccup must never report it as "failed"
    // (that would leave a paid, untracked number).
    let incoming;
    try {
      incoming = await client.incomingPhoneNumbers.create({ phoneNumber });
    } catch (err) {
      failed.push({ phoneNumber, error: err instanceof Error ? err.message : String(err) });
      continue;
    }

    let inService = false;
    try {
      await client.messaging.v1.services(serviceSid).phoneNumbers.create({ phoneNumberSid: incoming.sid });
      inService = true;
    } catch (err) {
      // Bought but not pooled — surfaced via inMessagingService=false; the
      // Compliance page's "Sync numbers" (or the next boot) retries the attach.
      console.error(`[puffping] purchased ${incoming.phoneNumber} but couldn't pool it:`, err);
    }

    try {
      await db.phoneNumber.upsert({
        where: { twilioSid: incoming.sid },
        create: {
          tenantId,
          phoneNumber: incoming.phoneNumber,
          twilioSid: incoming.sid,
          friendlyName: incoming.friendlyName,
          numberType: isTollFree(incoming.phoneNumber) ? "tollfree" : "local",
          capabilities: JSON.stringify(incoming.capabilities ?? {}),
          inMessagingService: inService,
        },
        update: { inMessagingService: inService },
      });
    } catch (err) {
      console.error(`[puffping] purchased ${incoming.phoneNumber} but failed to record it:`, err);
    }
    purchased.push(incoming.phoneNumber);
  }

  if (purchased.length) invalidateSenderCache(tenantId);
  return NextResponse.json({ purchased, failed }, { status: failed.length && !purchased.length ? 500 : 200 });
}
