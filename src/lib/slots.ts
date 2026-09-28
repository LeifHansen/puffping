import { Prisma } from "@prisma/client";
import type { NumberSlot, PhoneNumber } from "@prisma/client";
import { db } from "./db";
import { isBillingConfigured, stripeRequest } from "./billing";
import { isTollFree, normalizePhone } from "./phone";
import { campaignOneMessagingServiceSid, isTwilioConfigured, twilio } from "./twilio";

/**
 * Number slot marketplace.
 *
 * Inventory: each approved A2P 10DLC campaign (a `MessagingCampaign` = one
 * Twilio Messaging Service with a VERIFIED usAppToPerson campaign) provides
 * `capacity` slots (49 by default). A workspace buys a slot ($25/mo, one
 * Stripe subscription per slot) and then claims one local number into it.
 *
 * Slot lifecycle (`NumberSlot.status`):
 *   available ──reserve──▶ reserved ──checkout completed──▶ active ⇄ past_due
 *       ▲                     │ (checkout expired / abandoned)      │
 *       └─────────────────────┴──────── subscription deleted ◀──────┘
 *                                        (releaseSlot: number released)
 *
 * Number lifecycle (`PhoneNumber.status`): claimed numbers are attached to the
 * slot's campaign immediately and start `pending_registration`; the Twilio
 * Event Streams webhook (/api/webhooks/twilio/events) flips them to `active`
 * once carrier registration completes. Only active numbers on active slots
 * send (see src/lib/sender.ts).
 *
 * Every transition is a status-guarded conditional update, so webhook retries
 * and multi-machine races are harmless.
 */

export const DEFAULT_CAMPAIGN_CAPACITY = 49;
/** Stripe Checkout sessions must live ≥ 30 min; a minute of headroom. */
export const CHECKOUT_TTL_SECONDS = 31 * 60;
/** Keep the reservation a bit past checkout expiry so a just-completed payment always finds its slot. */
const RESERVATION_GRACE_MS = 5 * 60_000;
/** A crashed claim must not wedge a slot forever. */
const CLAIM_LOCK_MS = 2 * 60_000;

/** An error whose message is safe to show the user, with an HTTP status. */
export class SlotError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
    this.name = "SlotError";
  }
}

export type StripeCheckoutSession = {
  id: string;
  status?: string | null; // open | complete | expired
  subscription?: string | null;
  customer?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
};

export type StripeSubscription = {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  items?: { data?: { current_period_end?: number }[] };
  metadata?: Record<string, string> | null;
};

// ---------------------------------------------------------------------------
// Inventory + reservations
// ---------------------------------------------------------------------------

/** Slots a workspace can buy right now (available slots on active campaigns). */
export function availableSlotCount(): Promise<number> {
  return db.numberSlot.count({ where: { status: "available", campaign: { status: "active" } } });
}

/**
 * Atomically reserve one available slot for a tenant (oldest campaign first, so
 * campaigns fill up in order). SKIP LOCKED means concurrent buyers each get a
 * different slot and the campaign can never be oversold. Returns null when sold out.
 */
export async function reserveSlot(tenantId: string, checkoutExpiresAt: Date): Promise<string | null> {
  const reservedUntil = new Date(checkoutExpiresAt.getTime() + RESERVATION_GRACE_MS);
  // Prisma stores DateTime as UTC in `timestamp` columns; convert explicitly so
  // the session TimeZone can't shift these values.
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "NumberSlot"
    SET status = 'reserved', "tenantId" = ${tenantId},
        "reservedUntil" = (${reservedUntil}::timestamptz AT TIME ZONE 'UTC'),
        "updatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE status = 'available' AND id = (
      SELECT s.id FROM "NumberSlot" s
      JOIN "MessagingCampaign" c ON c.id = s."campaignId"
      WHERE s.status = 'available' AND c.status = 'active'
      ORDER BY c."createdAt" ASC, s.id ASC
      LIMIT 1
      FOR UPDATE OF s SKIP LOCKED
    )
    RETURNING id
  `;
  return rows[0]?.id ?? null;
}

/** Return a reserved slot to inventory (guarded: only while still reserved). */
export async function releaseReservation(opts: { slotId: string; sessionId?: string }): Promise<boolean> {
  const res = await db.numberSlot.updateMany({
    where: {
      id: opts.slotId,
      status: "reserved",
      ...(opts.sessionId ? { stripeCheckoutSessionId: opts.sessionId } : {}),
    },
    data: { status: "available", tenantId: null, reservedUntil: null, stripeCheckoutSessionId: null },
  });
  return res.count > 0;
}

/**
 * Resolve a reservation against Stripe's view of its checkout: activate it if
 * the checkout actually completed (e.g. webhook delayed), otherwise expire the
 * checkout and put the slot back in inventory.
 */
export async function settleReservation(slot: Pick<NumberSlot, "id" | "stripeCheckoutSessionId">): Promise<void> {
  const sessionId = slot.stripeCheckoutSessionId;
  if (sessionId && isBillingConfigured()) {
    const session = await stripeRequest<StripeCheckoutSession>("GET", `checkout/sessions/${sessionId}`);
    if (session.status === "complete") {
      await activateSlotFromCheckout(session);
      return;
    }
    if (session.status === "open") {
      // Throws if the buyer completes at this exact moment — the reservation
      // then stays put and the completion webhook activates it.
      await stripeRequest("POST", `checkout/sessions/${sessionId}/expire`);
    }
  }
  await releaseReservation({ slotId: slot.id });
}

/** Scheduler hook: settle reservations whose checkout window has passed. */
export async function sweepExpiredReservations(): Promise<void> {
  const expired = await db.numberSlot.findMany({
    where: { status: "reserved", reservedUntil: { lt: new Date() } },
    select: { id: true, stripeCheckoutSessionId: true },
    take: 50,
  });
  for (const slot of expired) {
    try {
      await settleReservation(slot);
    } catch (err) {
      console.error(`[puffping] settling expired reservation ${slot.id} failed:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Payment (Stripe) → slot state
// ---------------------------------------------------------------------------

/**
 * checkout.session.completed for a number slot. Idempotent. If the reservation
 * was lost (webhook delayed past the sweep and the slot resold), the buyer gets
 * any other free slot; if none remain, the subscription is canceled and the
 * incident is logged for a manual refund.
 */
export async function activateSlotFromCheckout(session: StripeCheckoutSession): Promise<NumberSlot | null> {
  const slotId = session.metadata?.slotId;
  const tenantId = session.metadata?.tenantId || session.client_reference_id || null;
  const subscriptionId = session.subscription ?? null;
  if (!slotId || !tenantId || !subscriptionId) {
    throw new Error(`Slot checkout ${session.id} is missing slotId/tenantId/subscription`);
  }

  const already = await db.numberSlot.findUnique({ where: { stripeSubscriptionId: subscriptionId } });
  if (already) return already; // webhook replay

  const data = {
    status: "active",
    tenantId,
    stripeSubscriptionId: subscriptionId,
    reservedUntil: null,
    purchasedAt: new Date(),
    cancelAtPeriodEnd: false,
    comped: false,
  };
  let activatedId: string | null = null;
  const res = await db.numberSlot.updateMany({ where: { id: slotId, tenantId, status: "reserved" }, data });
  if (res.count === 1) {
    activatedId = slotId;
  } else {
    const fallbackId = await reserveSlot(tenantId, new Date());
    if (fallbackId) {
      await db.numberSlot.updateMany({ where: { id: fallbackId, tenantId, status: "reserved" }, data });
      activatedId = fallbackId;
    }
  }

  if (!activatedId) {
    await stripeRequest("DELETE", `subscriptions/${subscriptionId}`).catch((err) =>
      console.error(`[puffping] could not cancel orphaned slot subscription ${subscriptionId}:`, err)
    );
    console.error(
      `[puffping] SLOT SOLD OUT AFTER PAYMENT: tenant ${tenantId} paid (checkout ${session.id}, subscription ${subscriptionId}) ` +
        "but no slot was free. Subscription canceled — refund the first invoice manually."
    );
    return null;
  }

  // Remember the Stripe customer so later checkouts reuse it (one customer per workspace).
  if (session.customer) {
    await db.tenant.updateMany({
      where: { id: tenantId, stripeCustomerId: null },
      data: { stripeCustomerId: session.customer },
    });
  }

  // Fill in the billing period now (subscription events may have arrived first).
  try {
    const sub = await stripeRequest<StripeSubscription>("GET", `subscriptions/${subscriptionId}`);
    await syncSlotSubscription(sub, false);
  } catch (err) {
    console.error(`[puffping] fetching slot subscription ${subscriptionId} failed:`, err);
  }
  return db.numberSlot.findUnique({ where: { id: activatedId } });
}

/**
 * customer.subscription.created/updated/deleted. Returns "not_slot" for
 * subscriptions that aren't number slots (plan subscriptions) so the caller
 * can fall through to its plan logic.
 */
export async function syncSlotSubscription(
  sub: StripeSubscription,
  deleted: boolean
): Promise<"handled" | "not_slot"> {
  const slot = await db.numberSlot.findUnique({ where: { stripeSubscriptionId: sub.id } });
  if (!slot) {
    // A slot subscription whose checkout hasn't been processed yet: nothing to
    // sync, and it must never be mistaken for a plan subscription.
    return sub.metadata?.kind === "number_slot" ? "handled" : "not_slot";
  }
  if (deleted || sub.status === "canceled" || sub.status === "incomplete_expired") {
    await releaseSlot(slot.id);
    return "handled";
  }
  const status = sub.status === "active" || sub.status === "trialing" ? "active" : "past_due";
  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  await db.numberSlot.updateMany({
    where: { id: slot.id, status: { in: ["active", "past_due"] } },
    data: {
      status,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      ...(periodEnd ? { currentPeriodEnd: new Date(periodEnd * 1000) } : {}),
    },
  });
  return "handled";
}

/**
 * Cancel (at period end) or resume a tenant's slot. Comped slots have no
 * subscription, so cancelling releases them immediately.
 */
export async function setSlotCancellation(
  slotId: string,
  tenantId: string,
  cancel: boolean
): Promise<{ released: boolean }> {
  const slot = await db.numberSlot.findFirst({
    where: { id: slotId, tenantId, status: { in: ["active", "past_due"] } },
  });
  if (!slot) throw new SlotError("Slot not found", 404);

  if (!slot.stripeSubscriptionId) {
    if (!cancel) return { released: false };
    await releaseSlot(slot.id);
    return { released: true };
  }

  const form = new URLSearchParams({ cancel_at_period_end: cancel ? "true" : "false" });
  await stripeRequest("POST", `subscriptions/${slot.stripeSubscriptionId}`, form);
  await db.numberSlot.update({ where: { id: slot.id }, data: { cancelAtPeriodEnd: cancel } });
  return { released: false };
}

// ---------------------------------------------------------------------------
// Numbers (Twilio) ↔ slots
// ---------------------------------------------------------------------------

function twilioStatus(err: unknown): number | undefined {
  return (err as { status?: number } | null)?.status;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Detach a number from its campaign's sender pool and release it from the account (404-tolerant). */
async function releaseTwilioNumber(messagingServiceSid: string | null, numberSid: string): Promise<void> {
  const client = twilio();
  if (messagingServiceSid) {
    try {
      await client.messaging.v1.services(messagingServiceSid).phoneNumbers(numberSid).remove();
    } catch (err) {
      if (twilioStatus(err) !== 404) throw err;
    }
  }
  try {
    await client.incomingPhoneNumbers(numberSid).remove();
  } catch (err) {
    if (twilioStatus(err) !== 404) throw err;
  }
}

/**
 * Buy `rawNumber` into a paid slot: purchase it, attach it to the slot's
 * campaign (Messaging Service sender pool — this is what registers it with the
 * campaign), and record it as `pending_registration`. If attaching or recording
 * fails the number is released again, so a slot never holds a paid-for number
 * that can't be used. A short lock stops double-submits buying two numbers.
 */
export async function claimNumber(slotId: string, tenantId: string, rawNumber: string): Promise<PhoneNumber> {
  const e164 = normalizePhone(rawNumber);
  if (!e164) throw new SlotError("Enter a valid US phone number");
  if (isTollFree(e164)) throw new SlotError("Number slots hold local (10DLC) numbers only");

  const locked = await db.numberSlot.updateMany({
    where: {
      id: slotId,
      tenantId,
      status: "active",
      phoneNumberId: null,
      OR: [{ claimLockedAt: null }, { claimLockedAt: { lt: new Date(Date.now() - CLAIM_LOCK_MS) } }],
    },
    data: { claimLockedAt: new Date() },
  });
  if (locked.count === 0) {
    const slot = await db.numberSlot.findFirst({ where: { id: slotId, tenantId } });
    if (!slot) throw new SlotError("Slot not found", 404);
    if (slot.phoneNumberId) throw new SlotError("This slot already has a number", 409);
    if (slot.status === "past_due") throw new SlotError("This slot's payment is past due — update billing first", 402);
    if (slot.status !== "active") throw new SlotError("This slot isn't paid for yet", 409);
    throw new SlotError("A number is already being claimed for this slot — try again in a moment", 409);
  }

  try {
    const slot = await db.numberSlot.findUniqueOrThrow({ where: { id: slotId }, include: { campaign: true } });
    const serviceSid = slot.campaign.messagingServiceSid;
    const client = twilio();

    let incoming;
    try {
      incoming = await client.incomingPhoneNumbers.create({ phoneNumber: e164 });
    } catch (err) {
      throw new SlotError(`Couldn't buy ${e164}: ${errorMessage(err)}`, 502);
    }

    try {
      await client.messaging.v1.services(serviceSid).phoneNumbers.create({ phoneNumberSid: incoming.sid });
      return await db.$transaction(async (tx) => {
        const number = await tx.phoneNumber.create({
          data: {
            tenantId,
            phoneNumber: incoming.phoneNumber,
            twilioSid: incoming.sid,
            friendlyName: incoming.friendlyName,
            numberType: "local",
            capabilities: JSON.stringify(incoming.capabilities ?? {}),
            inMessagingService: true,
            status: "pending_registration",
          },
        });
        await tx.numberSlot.update({ where: { id: slotId }, data: { phoneNumberId: number.id, claimLockedAt: null } });
        return number;
      });
    } catch (err) {
      await releaseTwilioNumber(serviceSid, incoming.sid).catch((releaseErr) =>
        console.error(`[puffping] claim rollback: could not release ${incoming.phoneNumber} (${incoming.sid}):`, releaseErr)
      );
      throw new SlotError(`Couldn't add ${e164} to the campaign: ${errorMessage(err)}`, 502);
    }
  } finally {
    await db.numberSlot.updateMany({ where: { id: slotId, claimLockedAt: { not: null } }, data: { claimLockedAt: null } });
  }
}

/**
 * Free a slot: release its number from Twilio (detach + release), delete the
 * number record (so inbound routing can never match a stale owner), and return
 * the slot to inventory. Throws on Twilio errors so webhooks get retried.
 */
export async function releaseSlot(slotId: string): Promise<void> {
  const slot = await db.numberSlot.findUnique({
    where: { id: slotId },
    include: { phoneNumber: true, campaign: true },
  });
  if (!slot || slot.status === "available") return;

  if (slot.phoneNumber) {
    if (isTwilioConfigured()) {
      await releaseTwilioNumber(slot.campaign.messagingServiceSid, slot.phoneNumber.twilioSid);
    }
    await db.phoneNumber.deleteMany({ where: { id: slot.phoneNumber.id } });
  }
  await db.numberSlot.update({
    where: { id: slot.id },
    data: {
      status: "available",
      tenantId: null,
      reservedUntil: null,
      stripeCheckoutSessionId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      comped: false,
      phoneNumberId: null,
      claimLockedAt: null,
      purchasedAt: null,
    },
  });
}

// ---------------------------------------------------------------------------
// Campaigns (platform admin)
// ---------------------------------------------------------------------------

/** SIDs of the local (10DLC) numbers currently in a service's sender pool. */
async function pooledLocalSids(messagingServiceSid: string): Promise<string[]> {
  const pooled = await twilio().messaging.v1.services(messagingServiceSid).phoneNumbers.list({ limit: 1000 });
  return pooled.filter((p) => !isTollFree(p.phoneNumber)).map((p) => p.sid);
}

/** Pooled local numbers PuffPing doesn't track — they use up campaign capacity. */
async function untrackedCount(pooledSids: string[]): Promise<number> {
  if (!pooledSids.length) return 0;
  return pooledSids.length - (await db.phoneNumber.count({ where: { twilioSid: { in: pooledSids } } }));
}

/**
 * Add an approved campaign to inventory. Validates with Twilio that the
 * Messaging Service exists and carries a VERIFIED A2P campaign, then creates
 * one slot per free seat (capacity minus numbers already in its pool).
 */
export async function addCampaign(input: { messagingServiceSid: string; name?: string; capacity?: number }) {
  const sid = input.messagingServiceSid.trim();
  if (!/^MG[0-9a-f]{32}$/i.test(sid)) throw new SlotError("Enter a Messaging Service SID (MG…)");
  const capacity = input.capacity ?? DEFAULT_CAMPAIGN_CAPACITY;
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 400) {
    throw new SlotError("Capacity must be a whole number between 1 and 400");
  }
  if (await db.messagingCampaign.findUnique({ where: { messagingServiceSid: sid } })) {
    throw new SlotError("That Messaging Service is already in inventory", 409);
  }
  if (!isTwilioConfigured()) throw new SlotError("Twilio is not configured");

  const client = twilio();
  let service;
  try {
    service = await client.messaging.v1.services(sid).fetch();
  } catch (err) {
    throw new SlotError(`Couldn't find Messaging Service ${sid}: ${errorMessage(err)}`, 404);
  }
  const a2p = await client.messaging.v1.services(sid).usAppToPerson.list({ limit: 20 });
  const verified = a2p.find((c) => c.campaignStatus === "VERIFIED");
  if (!verified) {
    throw new SlotError(
      `Messaging Service ${sid} has no VERIFIED A2P campaign (found: ${a2p.map((c) => c.campaignStatus).join(", ") || "none"})`
    );
  }

  const seatsTaken = await untrackedCount(await pooledLocalSids(sid));
  const slotCount = capacity - seatsTaken;
  if (slotCount <= 0) {
    throw new SlotError(`All ${capacity} seats are already used by numbers in this service's sender pool`);
  }

  return db.$transaction(async (tx) => {
    const campaign = await tx.messagingCampaign.create({
      data: {
        name: input.name?.trim() || service.friendlyName || sid,
        messagingServiceSid: sid,
        a2pCampaignSid: verified.sid,
        capacity,
      },
    });
    await tx.numberSlot.createMany({ data: Array.from({ length: slotCount }, () => ({ campaignId: campaign.id })) });
    return { campaign, slotsCreated: slotCount, seatsAlreadyUsed: seatsTaken };
  });
}

/**
 * Boot-time migration from the single-service model: turn the approved
 * Messaging Service (TWILIO_MESSAGING_SERVICE_SID, else the built-in
 * APPROVED_MESSAGING_SERVICE_SID) into "Campaign 1" and move the local numbers
 * already in its pool into comped (free) slots so existing workspaces keep
 * sending. Idempotent (unique messagingServiceSid) and safe across machines.
 */
export async function bootstrapCampaignFromEnv(): Promise<void> {
  const sid = campaignOneMessagingServiceSid();
  if (await db.messagingCampaign.findUnique({ where: { messagingServiceSid: sid } })) return;

  // The service's real sender pool decides which numbers move into Campaign 1:
  // a number flagged inMessagingService may sit in a different service (e.g.
  // from the old per-tenant 10DLC flow) and must not get a slot on this one.
  let pooledSids: string[] | null = null;
  if (isTwilioConfigured()) {
    try {
      pooledSids = await pooledLocalSids(sid);
    } catch (err) {
      console.error("[puffping] campaign bootstrap: couldn't read the sender pool (falling back to inMessagingService):", err);
    }
  }
  const legacy = await db.phoneNumber.findMany({
    where: {
      numberType: "local",
      slot: { is: null },
      ...(pooledSids ? { twilioSid: { in: pooledSids } } : { inMessagingService: true }),
    },
    orderBy: { purchasedAt: "asc" },
  });
  const seatsTaken = pooledSids ? await untrackedCount(pooledSids) : 0;
  const capacity = DEFAULT_CAMPAIGN_CAPACITY;
  const seats = Math.max(0, capacity - seatsTaken);
  const migrated = legacy.slice(0, seats);
  if (legacy.length > migrated.length) {
    console.error(
      `[puffping] campaign bootstrap: ${legacy.length - migrated.length} legacy number(s) exceed campaign capacity and were not given slots`
    );
  }

  try {
    await db.$transaction(async (tx) => {
      const campaign = await tx.messagingCampaign.create({
        data: { name: "Campaign 1", messagingServiceSid: sid, capacity },
      });
      const now = new Date();
      await tx.numberSlot.createMany({
        data: Array.from({ length: seats }, (_, i) => {
          const n = migrated[i];
          return n
            ? { campaignId: campaign.id, status: "active", tenantId: n.tenantId, phoneNumberId: n.id, comped: true, purchasedAt: now }
            : { campaignId: campaign.id };
        }),
      });
      if (migrated.length) {
        await tx.phoneNumber.updateMany({ where: { id: { in: migrated.map((n) => n.id) } }, data: { status: "active" } });
      }
    });
    console.log(`[puffping] campaign bootstrap: created Campaign 1 (${seats} slots, ${migrated.length} comped for existing numbers)`);
  } catch (err) {
    // Another machine won the race — the unique SID makes this a clean no-op.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
}
