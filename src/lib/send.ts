import { db } from "./db";
import { renderTemplate, segmentCount } from "./render";
import { appBaseUrl, twilio } from "./twilio";
import { NO_SENDER_ERROR, pickFrom, sendableNumbers, type Sender } from "./sender";
import { buildLinkMap, rewriteLinks } from "./links";
import { parseDefinition, segmentWhere } from "./segments";
import { addSuppression } from "./suppression";
import { Prisma } from "@prisma/client";

/**
 * Campaign sending at scale (hundreds → 100,000+ contacts).
 *
 * Design: the API request only ENQUEUES — it bulk-inserts `pending` message
 * rows in batches and returns immediately. A singleton background worker
 * drains the queue with bounded concurrency, retries Twilio 429s with
 * backoff, and survives restarts (instrumentation resumes any pending rows
 * on boot). Each message goes out from one of the workspace's own numbers
 * (see src/lib/sender.ts) through that number's campaign Messaging Service. A
 * workspace with no number that can send can't send at all (see
 * requireSenders); delivery outcomes arrive via the status webhook.
 */

const ENQUEUE_BATCH = 1000; // contacts fetched/rendered per DB round-trip
const SEND_CONCURRENCY = 25; // concurrent Twilio API calls
const CLAIM_BATCH = 250; // pending rows claimed per worker cycle
const MAX_ATTEMPTS = 3;
// A `sending` row older than this with no Twilio SID belongs to a dead worker.
// Well above the worst-case time to drain one claimed batch.
const STALE_CLAIM_MS = 5 * 60_000;
// Twilio: "Attempt to send to unsubscribed recipient" (the recipient texted STOP).
const TWILIO_UNSUBSCRIBED = 21610;

/**
 * Enqueue a campaign. Fast even for 100k contacts; returns the queued count.
 * Idempotent: contacts that already have a message for this campaign are
 * skipped, so re-sending a campaign that failed mid-enqueue never double-texts.
 */
export async function queueCampaign(campaignId: string): Promise<{ queued: number }> {
  const campaign = await db.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { lists: true, segment: true },
  });
  // Callers (send route, scheduler) have already atomically claimed the
  // campaign into `sending`, so there's no status write here. Refuse before
  // queueing anything if the workspace has no number to send from.
  const senders = await requireSenders(campaign.tenantId);

  const tenantId = campaign.tenantId;
  const listIds = campaign.lists.map((l) => l.listId);
  const mediaUrls = campaign.mediaUrl ? JSON.stringify([campaign.mediaUrl]) : null;
  let queued = 0;
  let cursor: string | undefined;

  // Audience: a segment (saved filter) when set, otherwise the campaign's lists.
  // Both always exclude opted-out/suppressed contacts.
  const audienceWhere: Prisma.ContactWhereInput = campaign.segment
    ? segmentWhere(tenantId, parseDefinition(campaign.segment.definition))
    : { tenantId, optedOut: false, memberships: { some: { listId: { in: listIds } } } };

  // Pre-create tracked short links for every URL in the template once, so the
  // per-contact loop can rewrite links with no DB round-trips.
  const linkMap = await buildLinkMap({ tenantId, campaignId: campaign.id, body: campaign.body });

  for (;;) {
    // Keyset pagination via `id > cursor` — not Prisma's cursor+skip, which is
    // an OFFSET over the *filtered* rows: once the previous batch is messaged
    // it drops out of the filter and `skip: 1` would silently skip a recipient.
    const contacts = await db.contact.findMany({
      where: {
        AND: [audienceWhere, { messages: { none: { campaignId: campaign.id } } }, cursor ? { id: { gt: cursor } } : {}],
      },
      orderBy: { id: "asc" },
      take: ENQUEUE_BATCH,
    });
    if (!contacts.length) break;
    cursor = contacts[contacts.length - 1].id;

    // Sticky sender: contacts with an existing thread keep its number.
    const threads = await db.conversation.findMany({
      where: { tenantId, phone: { in: contacts.map((c) => c.phone) }, fromNumber: { not: null } },
      select: { phone: true, fromNumber: true },
    });
    const threadNumber = new Map(threads.map((t) => [t.phone, t.fromNumber]));

    const rows = contacts
      .map((contact) => {
        const rendered = renderTemplate(campaign.body, contact);
        // Rewrite links to tracked short URLs (per-contact for click attribution).
        const body = rewriteLinks(rendered, linkMap, contact.id);
        if (!body.trim() && !mediaUrls) return null;
        return {
          tenantId,
          direction: "outbound",
          phone: contact.phone,
          fromNumber: pickFrom(senders, contact.phone, threadNumber.get(contact.phone))?.phoneNumber ?? null,
          body,
          mediaUrls,
          status: "pending",
          numSegments: segmentCount(body).segments,
          campaignId: campaign.id,
          contactId: contact.id,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length) {
      await db.message.createMany({ data: rows });
      queued += rows.length;
    }
    if (contacts.length < ENQUEUE_BATCH) break;
  }

  // Mark enqueueing done — only then may the worker finalize the campaign
  // (before this, an empty queue just means rows haven't been inserted yet).
  await db.campaign.update({ where: { id: campaignId }, data: { enqueuedAt: new Date() } });
  ensureSendWorker(); // also finalizes a campaign with nothing (left) to send
  return { queued };
}

// ---------------------------------------------------------------------------
// Background worker (singleton per Node process)
// ---------------------------------------------------------------------------

const g = globalThis as unknown as { __puffpingWorker?: boolean };

function ensureSendWorker() {
  if (g.__puffpingWorker) return;
  g.__puffpingWorker = true;
  void workerLoop()
    .catch((err) => {
      // Never let a transient DB/Twilio error become an unhandled rejection
      // (fatal in Node) — log and let the next enqueue/boot re-arm the worker.
      console.error("[puffping] send worker crashed:", err);
    })
    .finally(() => {
      g.__puffpingWorker = false;
    });
}

async function workerLoop() {
  const client = twilio();
  const statusCallback = `${appBaseUrl()}/api/webhooks/twilio/status`;

  for (;;) {
    const candidates = await db.message.findMany({
      where: { status: "pending", direction: "outbound" },
      orderBy: { createdAt: "asc" },
      take: CLAIM_BATCH,
    });
    if (!candidates.length) break;

    // ATOMIC claim: only rows still `pending` flip to `sending`, and only the
    // rows we actually claimed get sent. Prevents double-texting when multiple
    // workers run (multi-machine deploy, boot resume racing an active worker).
    // `updatedAt` stamps the claim so resumePendingSends can tell a dead
    // worker's rows from ones a live machine is sending right now.
    const claimedRows = await db.$queryRaw<{ id: string }[]>`
      UPDATE "Message" SET status = 'sending', "updatedAt" = now()
      WHERE id IN (${Prisma.join(candidates.map((m) => m.id))}) AND status = 'pending'
      RETURNING id
    `;
    const claimedIds = new Set(claimedRows.map((r) => r.id));
    const queue = candidates.filter((m) => claimedIds.has(m.id));
    if (!queue.length) continue; // another worker claimed this batch

    // Sendable numbers per tenant, loaded once per batch so a number that just
    // went past due / finished registering is picked up on the next batch.
    const sendersByTenant = new Map<string, Promise<Sender[]>>();
    const sendersFor = (tenantId: string) => {
      let p = sendersByTenant.get(tenantId);
      if (!p) sendersByTenant.set(tenantId, (p = sendableNumbers(tenantId)));
      return p;
    };
    // Why a tenant can't send (only computed for tenants that can't).
    const reasonByTenant = new Map<string, Promise<string>>();
    const reasonFor = (tenantId: string) => {
      let p = reasonByTenant.get(tenantId);
      if (!p) reasonByTenant.set(tenantId, (p = sendingNumberStatus(tenantId).then((s) => s.reason ?? NO_SENDER_ERROR)));
      return p;
    };

    async function sender() {
      for (;;) {
        const msg = queue.shift();
        if (!msg) return;
        // The number chosen at enqueue time, unless it can no longer send.
        const from = pickFrom(await sendersFor(msg.tenantId), msg.phone, msg.fromNumber);
        if (!from) {
          // Rows queued before the workspace lost its numbers (slot lapsed,
          // number released) fail rather than wait forever.
          await db.message.update({
            where: { id: msg.id },
            data: { status: "failed", errorCode: NO_SENDING_NUMBER, errorMessage: await reasonFor(msg.tenantId) },
          });
          continue;
        }
        let attempt = 0;
        for (;;) {
          attempt++;
          try {
            const res = await client.messages.create({
              to: msg.phone,
              from: from.phoneNumber,
              messagingServiceSid: from.messagingServiceSid,
              body: msg.body,
              mediaUrl: msg.mediaUrls ? (JSON.parse(msg.mediaUrls) as string[]) : undefined,
              statusCallback,
            });
            await db.message.update({
              where: { id: msg.id },
              data: { twilioSid: res.sid, status: res.status ?? "queued", fromNumber: from.phoneNumber },
            });
            break;
          } catch (err) {
            const { status, code } = err as { status?: number; code?: number };
            if (status === 429 && attempt < MAX_ATTEMPTS) {
              await sleep(1000 * 2 ** attempt);
              continue;
            }
            await db.message.update({
              where: { id: msg.id },
              data: {
                status: "failed",
                errorCode: code ? String(code) : status ? String(status) : null,
                errorMessage: err instanceof Error ? err.message : String(err),
              },
            });
            await suppressIfUnsubscribed(err, msg.tenantId, msg.phone);
            break;
          }
        }
      }
    }
    await Promise.all(Array.from({ length: SEND_CONCURRENCY }, sender));
    await finalizeCompletedCampaigns();
  }
  await finalizeCompletedCampaigns();
}

/**
 * Mark fully-enqueued campaigns whose queue has drained as sent, in one
 * statement. The startedAt fallback finalizes campaigns from before
 * `enqueuedAt` existed, or whose enqueue died mid-way, instead of leaving them
 * "sending" forever.
 */
async function finalizeCompletedCampaigns() {
  await db.$executeRaw`
    UPDATE "Campaign" c SET status = 'sent', "completedAt" = now(), "updatedAt" = now()
    WHERE c.status = 'sending'
      AND (c."enqueuedAt" IS NOT NULL OR c."startedAt" < now() - interval '1 hour')
      AND NOT EXISTS (
        SELECT 1 FROM "Message" m WHERE m."campaignId" = c.id AND m.status IN ('pending', 'sending')
      )
  `;
}

/**
 * Twilio refuses sends to a number that texted STOP to our sender. Mirror that
 * into this workspace's suppression list so its audiences and UI reflect the
 * opt-out, even if the STOP reached Twilio but never our inbound webhook.
 */
async function suppressIfUnsubscribed(err: unknown, tenantId: string, phone: string) {
  if ((err as { code?: number }).code !== TWILIO_UNSUBSCRIBED) return;
  await addSuppression(tenantId, phone, "opt_out").catch((e) =>
    console.error("[puffping] couldn't record Twilio opt-out:", e)
  );
}

// ---------------------------------------------------------------------------
// No number, no sending
// ---------------------------------------------------------------------------
//
// Every message goes out from one of the sending workspace's own numbers — a
// registered number on a paid slot (see sendableNumbers). A workspace without
// one can't send: sending, scheduling and inbox replies are refused up front
// (409 NO_SENDING_NUMBER) with a reason that says what to do about it.

export const NO_SENDING_NUMBER = "NO_SENDING_NUMBER";

/** Thrown when a workspace tries to send without a number that can send. */
export class NoSendingNumberError extends Error {
  readonly code = NO_SENDING_NUMBER;
  constructor(message: string) {
    super(message);
    this.name = "NoSendingNumberError";
  }
}

export type SendingNumberStatus = {
  total: number; // numbers the workspace owns
  sendable: number; // ...that can send now (registered, on a paid slot)
  canSend: boolean;
  reason: string | null; // why not, phrased for the user; null when canSend
};

/**
 * Whether the workspace can send, and if not, the most useful thing to tell it
 * — ordered so a workspace that's merely waiting (registration in progress)
 * isn't told to buy something it already has.
 */
export async function sendingNumberStatus(tenantId: string): Promise<SendingNumberStatus> {
  const [total, senders, slots] = await Promise.all([
    db.phoneNumber.count({ where: { tenantId } }),
    sendableNumbers(tenantId),
    db.numberSlot.findMany({
      where: { tenantId, status: { in: ["active", "past_due"] } },
      select: { status: true, phoneNumber: { select: { status: true } } },
    }),
  ]);
  const has = (slotStatus: string, numberStatus: string | null) =>
    slots.some((s) => s.status === slotStatus && (s.phoneNumber?.status ?? null) === numberStatus);

  const reason = senders.length
    ? null
    : has("active", "pending_registration")
      ? "Your number is finishing carrier registration — you can send as soon as carriers approve it (check its status on the Numbers page)."
      : has("active", null)
        ? "Claim a number into your number slot on the Numbers page — you can send once its carrier registration completes."
        : has("active", "registration_failed")
          ? "Carrier registration failed for your number — see the Numbers page for details."
          : slots.some((s) => s.status === "past_due")
            ? "Your number slot's payment is past due, so sending is paused — update your billing to resume."
            : total
              ? "Only numbers in a paid number slot can send — buy a slot and claim a number on the Numbers page."
              : "Buy a number slot and claim a number on the Numbers page before sending — every message goes out from one of your own numbers.";
  return { total, sendable: senders.length, canSend: senders.length > 0, reason };
}

/** Throw NoSendingNumberError unless the workspace has a number that can send. */
export async function assertCanSend(tenantId: string): Promise<void> {
  await requireSenders(tenantId);
}

/** The workspace's sendable numbers, or NoSendingNumberError saying why there are none. */
async function requireSenders(tenantId: string): Promise<Sender[]> {
  const senders = await sendableNumbers(tenantId);
  if (senders.length) return senders;
  const { reason } = await sendingNumberStatus(tenantId);
  throw new NoSendingNumberError(reason ?? NO_SENDER_ERROR);
}

/**
 * Requeue rows a dead worker claimed but never handed to Twilio, and make sure
 * the worker runs if anything is pending. Only STALE claims are touched —
 * another live machine may be mid-batch, and requeueing its fresh claims would
 * double-text those recipients. Called on boot and every scheduler tick.
 */
export async function resumePendingSends() {
  await db.message.updateMany({
    where: {
      status: "sending",
      direction: "outbound",
      twilioSid: null,
      updatedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) },
    },
    data: { status: "pending" },
  });
  const pending = await db.message.findFirst({
    where: { status: "pending", direction: "outbound" },
    select: { id: true },
  });
  if (pending) ensureSendWorker();
}

/**
 * Send a single ad-hoc message (inbox replies, drip steps). Throws
 * NoSendingNumberError, before contacting Twilio, if the workspace has no
 * number to send from.
 */
export async function sendDirectMessage(opts: {
  tenantId: string;
  to: string;
  body: string;
  mediaUrls?: string[];
  conversationId?: string;
  contactId?: string;
}): Promise<string> {
  // Reply on the thread's number when there is one (sticky per contact).
  const thread = await db.conversation.findFirst({
    where: opts.conversationId
      ? { id: opts.conversationId, tenantId: opts.tenantId }
      : { tenantId: opts.tenantId, phone: opts.to },
    select: { fromNumber: true },
  });
  const from = pickFrom(await requireSenders(opts.tenantId), opts.to, thread?.fromNumber)!;
  const client = twilio();
  const msg = await client.messages
    .create({
      to: opts.to,
      from: from.phoneNumber,
      messagingServiceSid: from.messagingServiceSid,
      body: opts.body,
      mediaUrl: opts.mediaUrls,
      statusCallback: `${appBaseUrl()}/api/webhooks/twilio/status`,
    })
    .catch(async (err) => {
      await suppressIfUnsubscribed(err, opts.tenantId, opts.to);
      throw err;
    });
  const record = await db.message.create({
    data: {
      tenantId: opts.tenantId,
      direction: "outbound",
      phone: opts.to,
      fromNumber: from.phoneNumber,
      body: opts.body,
      mediaUrls: opts.mediaUrls ? JSON.stringify(opts.mediaUrls) : null,
      twilioSid: msg.sid,
      status: msg.status ?? "queued",
      numSegments: segmentCount(opts.body).segments,
      conversationId: opts.conversationId,
      contactId: opts.contactId,
    },
  });
  if (opts.conversationId) {
    await db.conversation.update({
      where: { id: opts.conversationId },
      data: { lastMessageAt: new Date(), lastMessageBody: opts.body, fromNumber: from.phoneNumber },
    });
  }
  return record.id;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
