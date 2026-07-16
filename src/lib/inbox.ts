import { db } from "./db";

const OPT_OUT_KEYWORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "revoke", "optout"];
const OPT_IN_KEYWORDS = ["start", "unstop", "yes", "subscribe"];

/**
 * Record an inbound message: upsert the conversation, link a known contact,
 * and apply STOP/START opt-out compliance. Twilio's Advanced Opt-Out already
 * blocks further sends at the carrier level; we mirror the state locally so
 * campaign audiences exclude opted-out contacts.
 */
export async function recordInboundMessage(opts: {
  from: string;
  body: string;
  twilioSid: string;
  mediaUrls: string[];
  numSegments: number;
}) {
  const { from, body, twilioSid, mediaUrls, numSegments } = opts;

  const contact = await db.contact.findUnique({ where: { phone: from } });

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
    where: { phone: from },
    create: {
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

  return conversation;
}
