import { createHash } from "crypto";
import { db } from "./db";

/**
 * Which workspace number a message goes out from.
 *
 * Every workspace sends only from numbers it owns: `from` = one of its active
 * numbers, `messagingServiceSid` = that number's campaign (Messaging Service).
 * A number can send when it has finished carrier registration (`active`) and
 * its slot is paid (`active`; `past_due` pauses it).
 *
 * Selection is sticky per contact: the conversation's number when there is one
 * (so replies stay on the thread's number), otherwise a stable hash of the
 * contact's phone over the workspace's sendable numbers.
 */

export type Sender = { phoneNumber: string; messagingServiceSid: string };

export const NO_SENDER_ERROR =
  "No active sending numbers. Buy a number slot and claim a number on the Numbers page — new numbers can send once carrier registration completes.";

/** The workspace's numbers that can send right now, in a stable order. */
export async function sendableNumbers(tenantId: string): Promise<Sender[]> {
  const rows = await db.phoneNumber.findMany({
    where: { tenantId, status: "active", slot: { is: { status: "active" } } },
    select: { phoneNumber: true, slot: { select: { campaign: { select: { messagingServiceSid: true } } } } },
    orderBy: { phoneNumber: "asc" },
  });
  return rows.flatMap((r) =>
    r.slot ? [{ phoneNumber: r.phoneNumber, messagingServiceSid: r.slot.campaign.messagingServiceSid }] : []
  );
}

/** Pick the sender for one contact from a pre-loaded list (no I/O — safe in hot loops). */
export function pickFrom(senders: Sender[], contactPhone: string, preferred?: string | null): Sender | null {
  if (!senders.length) return null;
  if (preferred) {
    const match = senders.find((s) => s.phoneNumber === preferred);
    if (match) return match;
  }
  const bucket = createHash("sha1").update(contactPhone).digest().readUInt32BE(0);
  return senders[bucket % senders.length];
}

export async function pickSender(
  tenantId: string,
  contactPhone: string,
  preferred?: string | null
): Promise<Sender | null> {
  return pickFrom(await sendableNumbers(tenantId), contactPhone, preferred);
}
