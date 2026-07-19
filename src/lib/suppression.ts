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

export async function removeSuppression(tenantId: string, rawPhone: string) {
  const phone = normalizePhone(rawPhone) ?? rawPhone;
  await db.suppression.deleteMany({ where: { tenantId, phone } });
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
