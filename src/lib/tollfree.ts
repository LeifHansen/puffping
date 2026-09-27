import type { TollFreeVerification } from "@prisma/client";
import { db } from "./db";
import { invalidateSenderCache } from "./send";
import { twilio } from "./twilio";

/**
 * Toll-free verification. Requires an owned toll-free number (buy one on the
 * Numbers page first), then submits the verification with the minimum info
 * Twilio requires. Status can be re-polled at any time.
 */
export async function submitTollFreeVerification(id: string): Promise<TollFreeVerification> {
  const reg = await db.tollFreeVerification.findUniqueOrThrow({ where: { id } });
  const client = twilio();

  try {
    if (!reg.verificationSid) {
      const verification = await client.messaging.v1.tollfreeVerifications.create({
        tollfreePhoneNumberSid: reg.phoneNumberSid,
        businessName: reg.businessName,
        businessWebsite: reg.businessWebsite,
        businessStreetAddress: reg.addressStreet,
        businessCity: reg.addressCity,
        businessStateProvinceRegion: reg.addressState,
        businessPostalCode: reg.addressPostalCode,
        businessCountry: reg.addressCountry,
        businessContactFirstName: reg.contactFirstName,
        businessContactLastName: reg.contactLastName,
        businessContactEmail: reg.contactEmail,
        businessContactPhone: reg.contactPhone,
        notificationEmail: reg.contactEmail,
        useCaseCategories: [reg.useCaseCategory],
        useCaseSummary: reg.useCaseSummary,
        productionMessageSample: reg.productionMessageSample,
        optInType: reg.optInType as "VERBAL" | "WEB_FORM" | "PAPER_FORM" | "VIA_TEXT" | "MOBILE_QR_CODE",
        optInImageUrls: reg.optInImageUrls ? (JSON.parse(reg.optInImageUrls) as string[]) : [],
        messageVolume: reg.messageVolume,
      });
      return db.tollFreeVerification.update({
        where: { id },
        data: { verificationSid: verification.sid, status: "submitted" },
      });
    }
    return refreshTollFreeStatus(id);
  } catch (err) {
    return db.tollFreeVerification.update({
      where: { id },
      data: { status: "rejected", rejectionReason: err instanceof Error ? err.message : String(err) },
    });
  }
}

export async function refreshTollFreeStatus(id: string): Promise<TollFreeVerification> {
  const reg = await db.tollFreeVerification.findUniqueOrThrow({ where: { id } });
  if (!reg.verificationSid) return reg;
  const client = twilio();
  const verification = await client.messaging.v1.tollfreeVerifications(reg.verificationSid).fetch();
  const map: Record<string, string> = {
    PENDING_REVIEW: "submitted",
    IN_REVIEW: "in_review",
    TWILIO_APPROVED: "approved",
    TWILIO_REJECTED: "rejected",
  };
  const updated = await db.tollFreeVerification.update({
    where: { id },
    data: {
      status: map[verification.status] ?? reg.status,
      rejectionReason:
        verification.status === "TWILIO_REJECTED"
          ? (verification.rejectionReason ?? "Rejected — see Twilio console for details")
          : null,
    },
  });
  // An approved toll-free number becomes a sender (see loadTenantSenders).
  if (updated.status !== reg.status) invalidateSenderCache(reg.tenantId);
  return updated;
}

/**
 * Pull Twilio's current status for verifications still under review. Approval
 * is what lets a toll-free number send, so it must reach the DB without anyone
 * clicking anything. Each refresh bumps updatedAt, so `staleMs` spaces out
 * re-checks of the same row. Run from the scheduler tick (all workspaces) and
 * when the Compliance page loads (one workspace).
 */
const REFRESH_CONCURRENCY = 5;
// Per-row cap: a hung Twilio request (SDK default timeout 30s) must not stall the poll.
const REFRESH_DEADLINE_MS = 10_000;

export async function refreshPendingTollFreeVerifications(opts: { tenantId?: string; staleMs: number; limit: number }) {
  const due = await db.tollFreeVerification.findMany({
    where: {
      ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
      status: { in: ["submitted", "in_review"] },
      verificationSid: { not: null },
      updatedAt: { lt: new Date(Date.now() - opts.staleMs) },
    },
    orderBy: { updatedAt: "asc" },
    take: opts.limit,
    select: { id: true },
  });
  const queue = due.map((d) => d.id);
  async function worker() {
    for (let id = queue.shift(); id; id = queue.shift()) {
      const rowId = id;
      await withDeadline(refreshTollFreeStatus(rowId), REFRESH_DEADLINE_MS).catch(async (err) => {
        console.error(`[puffping] toll-free verification refresh failed (${rowId}):`, err);
        // Still space out the next attempt, or a row Twilio keeps erroring on
        // (e.g. a deleted verification) would be re-fetched every tick.
        await db.tollFreeVerification.update({ where: { id: rowId }, data: { updatedAt: new Date() } }).catch(() => {});
      });
    }
  }
  await Promise.all(Array.from({ length: REFRESH_CONCURRENCY }, worker));
}

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
}
