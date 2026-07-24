import { db } from "./db";
import { handleKeywordTriggers } from "./automations";
import { addSuppression, removeSuppression } from "./suppression";

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

  // Idempotency: Twilio retries webhooks on any non-2xx. A duplicate delivery
  // must be a clean no-op, not a unique-violation 500 (which triggers more retries).
  if (twilioSid) {
    const dupe = await db.message.findUnique({ where: { twilioSid }, select: { conversationId: true } });
    if (dupe) {
      return db.conversation.findUnique({ where: { id: dupe.conversationId ?? "" } });
    }
  }

  const contact = await db.contact.findUnique({
    where: { tenantId_phone: { tenantId, phone: from } },
  });

  // STOP/START drive the suppression list (which mirrors onto contact.optedOut),
  // so opt-outs work even for numbers we don't have as contacts yet.
  const keyword = body.trim().toLowerCase();
  if (OPT_OUT_KEYWORDS.includes(keyword)) {
    await addSuppression(tenantId, from, "opt_out");
  } else if (OPT_IN_KEYWORDS.includes(keyword)) {
    await removeSuppression(tenantId, from);
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
