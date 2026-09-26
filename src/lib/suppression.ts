import { db } from "./db";
import { normalizePhone } from "./phone";

/**
 * Suppression / DNC list. A suppressed phone is mirrored onto any matching
 * contact's `optedOut` flag, so every send-time audience query (which already
 * filters `optedOut: false`) excludes it with no extra joins — this stays cheap
 * at 100k+ contacts.
 */

export async function addSuppression(tenantId: string, rawPhone: string, reason = "manual") {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const suppression = await db.suppression.upsert({
    where: { tenantId_phone: { tenantId, phone } },
    create: { tenantId, phone, reason },
    update: { reason },
  });
  // Mirror onto the contact so audiences exclude it.
  await db.contact.updateMany({
    where: { tenantId, phone },
    data: { optedOut: true, optedOutAt: new Date() },
  });
  return suppression;
}

/**
 * Bulk add (pasted DNC lists): a couple of statements per 1,000 numbers
 * instead of two round-trips per number. Existing entries keep their reason.
 */
export async function addSuppressions(tenantId: string, rawPhones: string[], reason = "manual") {
  const valid = rawPhones.map((p) => normalizePhone(p)).filter((p): p is string => !!p);
  const phones = [...new Set(valid)];
  for (let i = 0; i < phones.length; i += 1000) {
    const chunk = phones.slice(i, i + 1000);
    await db.$transaction([
      db.suppression.createMany({ data: chunk.map((phone) => ({ tenantId, phone, reason })), skipDuplicates: true }),
      db.contact.updateMany({
        where: { tenantId, phone: { in: chunk }, optedOut: false },
        data: { optedOut: true, optedOutAt: new Date() },
      }),
    ]);
  }
  return { added: phones.length, invalid: rawPhones.length - valid.length };
}

/**
 * Lift a suppression. `onlyReason` restricts which entries may be lifted — an
 * inbound START only reverses an opt-out, never an admin's manual DNC entry.
 */
export async function removeSuppression(tenantId: string, rawPhone: string, onlyReason?: string) {
  const phone = normalizePhone(rawPhone) ?? rawPhone;
  const { count } = await db.suppression.deleteMany({
    where: { tenantId, phone, ...(onlyReason ? { reason: onlyReason } : {}) },
  });
  if (onlyReason && count === 0 && (await isSuppressed(tenantId, phone))) return; // kept (other reason)
  // Re-enable any matching contact (explicit opt-in).
  await db.contact.updateMany({
    where: { tenantId, phone },
    data: { optedOut: false, optedOutAt: null },
  });
}

export async function isSuppressed(tenantId: string, rawPhone: string): Promise<boolean> {
  const phone = normalizePhone(rawPhone) ?? rawPhone;
  const hit = await db.suppression.findUnique({ where: { tenantId_phone: { tenantId, phone } } });
  return Boolean(hit);
}
