import { db } from "./db";
import { renderTemplate, segmentCount } from "./render";
import { appBaseUrl, messagingServiceSid, twilio } from "./twilio";
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
 * on boot). Every send goes through PuffPing's approved Messaging Service,
 * pinned to one of the workspace's own pooled numbers (see pickSender);
 * delivery outcomes arrive via the status webhook.
 */

const ENQUEUE_BATCH = 1000; // contacts fetched/rendered per DB round-trip
const SEND_CONCURRENCY = 25; // concurrent Twilio API calls
const CLAIM_BATCH = 250; // pending rows claimed per worker cycle
const MAX_ATTEMPTS = 3;
// A `sending` row older than this with no Twilio SID belongs to a dead worker.
// Well above the worst-case time to drain one claimed batch.
const STALE_CLAIM_MS = 5 * 60_000;
// Twilio: "Attempt to send to unsubscribed recipient" (STOP'd on the service).
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
  // campaign into `sending`, so there's no status write here.

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
  const serviceSid = messagingServiceSid();
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
    // `updatedAt` stamps the claim so recoverStaleClaims can tell a dead
    // worker's rows from ones a live machine is sending right now.
    const claimedRows = await db.$queryRaw<{ id: string }[]>`
      UPDATE "Message" SET status = 'sending', "updatedAt" = now()
      WHERE id IN (${Prisma.join(candidates.map((m) => m.id))}) AND status = 'pending'
      RETURNING id
    `;
    const claimedIds = new Set(claimedRows.map((r) => r.id));
    const queue = candidates.filter((m) => claimedIds.has(m.id));
    if (!queue.length) continue; // another worker claimed this batch
    async function sender() {
      for (;;) {
        const msg = queue.shift();
        if (!msg) return;
        const from = pickSender(await tenantSenders(msg.tenantId), msg.phone);
        let attempt = 0;
        for (;;) {
          attempt++;
          try {
            const res = await client.messages.create({
              to: msg.phone,
              messagingServiceSid: serviceSid,
              from,
              body: msg.body,
              mediaUrl: msg.mediaUrls ? (JSON.parse(msg.mediaUrls) as string[]) : undefined,
              statusCallback,
            });
            await db.message.update({
              where: { id: msg.id },
              data: { twilioSid: res.sid, status: res.status ?? "queued" },
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
 * Twilio refuses sends to a number that texted STOP on the (shared) Messaging
 * Service. Mirror that into this workspace's suppression list so its audiences
 * and UI reflect the opt-out, even if the STOP went to another number.
 */
async function suppressIfUnsubscribed(err: unknown, tenantId: string, phone: string) {
  if ((err as { code?: number }).code !== TWILIO_UNSUBSCRIBED) return;
  await addSuppression(tenantId, phone, "opt_out").catch((e) =>
    console.error("[puffping] couldn't record Twilio opt-out:", e)
  );
}

// ---------------------------------------------------------------------------
// Sender selection
// ---------------------------------------------------------------------------
//
// All workspaces share ONE Messaging Service. Left to itself, Twilio would pick
// any number in that shared pool — including another workspace's — and the
// recipient's reply (or STOP) would then route to that other workspace via the
// inbound webhook. So each send is pinned to one of the sending workspace's own
// pooled numbers. A workspace that hasn't bought a number yet falls back to the
// service's pool.

const SENDER_CACHE_TTL_MS = 60_000;
// Caches the in-flight promise so the worker's concurrent senders share one query.
const senderCache = new Map<string, { numbers: Promise<string[]>; expiresAt: number }>();

/**
 * The workspace's numbers that can send right now: in the Messaging Service
 * pool, and — for toll-free — carrier-verified (local numbers are covered by
 * the approved 10DLC campaign). Cached briefly; this is on the worker hot path.
 */
function tenantSenders(tenantId: string): Promise<string[]> {
  const hit = senderCache.get(tenantId);
  if (hit && hit.expiresAt > Date.now()) return hit.numbers;
  const numbers = loadTenantSenders(tenantId);
  senderCache.set(tenantId, { numbers, expiresAt: Date.now() + SENDER_CACHE_TTL_MS });
  numbers.catch(() => senderCache.delete(tenantId)); // don't cache a failed lookup
  return numbers;
}

async function loadTenantSenders(tenantId: string): Promise<string[]> {
  const [pooled, verifiedTollFree] = await Promise.all([
    db.phoneNumber.findMany({
      where: { tenantId, inMessagingService: true },
      select: { phoneNumber: true, numberType: true, twilioSid: true },
      orderBy: { phoneNumber: "asc" },
    }),
    db.tollFreeVerification.findMany({
      where: { tenantId, status: "approved" },
      select: { phoneNumberSid: true },
    }),
  ]);
  const verified = new Set(verifiedTollFree.map((v) => v.phoneNumberSid));
  return pooled
    .filter((n) => n.numberType !== "tollfree" || verified.has(n.twilioSid))
    .map((n) => n.phoneNumber);
}

/** Drop cached sender lists after numbers are bought or (re)pooled. */
export function invalidateSenderCache(tenantId?: string) {
  if (tenantId) senderCache.delete(tenantId);
  else senderCache.clear();
}

/**
 * Deterministic per-recipient pick (FNV-1a over the phone), so a contact always
 * hears from the same number across campaigns, drips, and inbox replies.
 * `undefined` = let the Messaging Service choose from its pool.
 */
export function pickSender(numbers: string[], to: string): string | undefined {
  if (!numbers.length) return undefined;
  let hash = 0x811c9dc5;
  for (let i = 0; i < to.length; i++) {
    hash ^= to.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return numbers[(hash >>> 0) % numbers.length];
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

/** Send a single ad-hoc message (inbox replies, test sends). */
export async function sendDirectMessage(opts: {
  tenantId: string;
  to: string;
  body: string;
  mediaUrls?: string[];
  conversationId?: string;
  contactId?: string;
}): Promise<string> {
  const client = twilio();
  const msg = await client.messages
    .create({
      to: opts.to,
      messagingServiceSid: messagingServiceSid(),
      from: pickSender(await tenantSenders(opts.tenantId), opts.to),
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
      data: { lastMessageAt: new Date(), lastMessageBody: opts.body },
    });
  }
  return record.id;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
