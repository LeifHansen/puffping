import { db } from "./db";
import { handleKeywordTriggers } from "./automations";

const OPT_OUT_KEYWORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout"];
const OPT_IN_KEYWORDS = ["start", "unstop", "yes", "subscribe"];

/**
 * Record an inbound message: upsert the conversation, link a known contact,
 * and apply STOP/START opt-out compliance. Twilio's Advanced Opt-Out already
 * blocks further sends at the carrier level; we mirror the state locally so
 * campaign audiences exclude opted-out contacts.
 */
export async function recordInboundMessage(opts: {
  tenantId: string;
  from: string;
  body: string;
  twilioSid: string;
  mediaUrls: string[];
  numSegments: number;
}) {
  const { tenantId, from, body, twilioSid, mediaUrls, numSegments } = opts;

  const contact = await db.contact.findUnique({
    where: { tenantId_phone: { tenantId, phone: from } },
  });

  const keyword = body.trim().toLowerCase();
  if (contact && OPT_OUT_KEYWORDS.includes(keyword)) {
    await db.contact.update({
      where: { id: contact.id },
      data: { optedOut: true, optedOutAt: new Date() },
    });
  } else if (contact && OPT_IN_KEYWORDS.includes(keyword)) {
    await db.contact.update({
      where: { id: contact.id },
      data: { optedOut: false, optedOutAt: null },
    });
  }

  const conversation = await db.conversation.upsert({
    where: { tenantId_phone: { tenantId, phone: from } },
    create: {
      tenantId,
      phone: from,
      contactId: contact?.id,
      lastMessageAt: new Date(),
      lastMessageBody: body,
      unreadCount: 1,
    },
    update: {
      lastMessageAt: new Date(),
      lastMessageBody: body,
      unreadCount: { increment: 1 },
      ...(contact ? { contactId: contact.id } : {}),
    },
  });

  await db.message.create({
    data: {
      tenantId,
      direction: "inbound",
      phone: from,
      body,
      mediaUrls: mediaUrls.length ? JSON.stringify(mediaUrls) : null,
      twilioSid,
      status: "received",
      numSegments,
      contactId: contact?.id,
      conversationId: conversation.id,
    },
  });

  // Keyword-triggered automations (e.g. "JOIN" -> welcome drip). Skip opt-out
  // keywords so unsubscribing never enrolls anyone.
  if (!OPT_OUT_KEYWORDS.includes(keyword)) {
    await handleKeywordTriggers({ tenantId, from, body, existingContactId: contact?.id }).catch(
      (err) => console.error("[puffping] keyword automation trigger failed:", err)
    );
  }

  return conversation;
}
