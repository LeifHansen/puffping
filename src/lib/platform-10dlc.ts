import { db } from "./db";
import { invalidateSenderCache } from "./send";
import { a2pCampaignSid, isTwilioConfigured, messagingServiceSid, twilio } from "./twilio";

/**
 * Platform-managed A2P 10DLC: every workspace sends under PuffPing's single
 * carrier-approved campaign (see APPROVED_* in ./twilio). This module reports
 * that campaign's live status and keeps purchased numbers in its sender pool.
 */

export type PlatformCampaignStatus = {
  campaignSid: string;
  /** Twilio's raw campaign status, e.g. VERIFIED | IN_PROGRESS | PENDING | FAILED. */
  twilioStatus: string | null;
  state: "approved" | "pending" | "failed" | "unknown";
  useCase: string | null;
  checkedAt: string;
  error?: string;
};

const STATUS_TTL_MS = 10 * 60_000; // carrier status changes rarely; don't hit Twilio per page view
let cachedStatus: { value: PlatformCampaignStatus; expiresAt: number } | null = null;

function stateOf(twilioStatus: string): PlatformCampaignStatus["state"] {
  if (twilioStatus === "VERIFIED") return "approved";
  if (twilioStatus === "FAILED" || twilioStatus === "SUSPENDED") return "failed";
  return "pending";
}

/** Live status of the platform campaign (cached for STATUS_TTL_MS). */
export async function getPlatformCampaignStatus(): Promise<PlatformCampaignStatus> {
  if (cachedStatus && cachedStatus.expiresAt > Date.now()) return cachedStatus.value;

  const base = { campaignSid: a2pCampaignSid(), checkedAt: new Date().toISOString() };
  let value: PlatformCampaignStatus;
  if (!isTwilioConfigured()) {
    value = { ...base, twilioStatus: null, state: "unknown", useCase: null, error: "Twilio is not configured" };
  } else {
    try {
      const campaign = await twilio()
        .messaging.v1.services(messagingServiceSid())
        .usAppToPerson(a2pCampaignSid())
        .fetch();
      value = {
        ...base,
        twilioStatus: campaign.campaignStatus,
        state: stateOf(campaign.campaignStatus),
        useCase: campaign.usAppToPersonUsecase ?? null,
      };
    } catch (err) {
      // Don't cache failures for the full TTL — retry on the next request.
      return {
        ...base,
        twilioStatus: null,
        state: "unknown",
        useCase: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  cachedStatus = { value, expiresAt: Date.now() + STATUS_TTL_MS };
  return value;
}

export type PoolSyncResult = {
  total: number;
  pooled: number;
  attached: number;
  failed: { phoneNumber: string; error: string }[];
};

/**
 * Reconcile purchased numbers with the Messaging Service's sender pool: attach
 * any that aren't in it (e.g. bought before the campaign was approved, when
 * Twilio refused the attach) and correct `inMessagingService` in both
 * directions. Idempotent. Scope to one workspace with `tenantId`, or omit it to
 * sync every workspace (boot).
 */
export async function syncSendingPool(tenantId?: string): Promise<PoolSyncResult> {
  const service = twilio().messaging.v1.services(messagingServiceSid());
  const inPool = new Set((await service.phoneNumbers.list()).map((p) => p.sid));
  const numbers = await db.phoneNumber.findMany({
    where: tenantId ? { tenantId } : {},
    select: { id: true, phoneNumber: true, twilioSid: true, inMessagingService: true },
  });

  const result: PoolSyncResult = { total: numbers.length, pooled: 0, attached: 0, failed: [] };
  for (const n of numbers) {
    let pooled = inPool.has(n.twilioSid);
    if (!pooled) {
      try {
        await service.phoneNumbers.create({ phoneNumberSid: n.twilioSid });
        pooled = true;
        result.attached++;
      } catch (err) {
        result.failed.push({ phoneNumber: n.phoneNumber, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (pooled) result.pooled++;
    if (pooled !== n.inMessagingService) {
      await db.phoneNumber.update({ where: { id: n.id }, data: { inMessagingService: pooled } });
    }
  }
  invalidateSenderCache(tenantId);
  return result;
}
