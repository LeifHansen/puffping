import { db } from "./db";
import { renderTemplate, segmentCount } from "./render";
import { appBaseUrl, messagingServiceSid, twilio } from "./twilio";
import { buildLinkMap, rewriteLinks } from "./links";
import { parseDefinition, segmentWhere } from "./segments";
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

/** Enqueue a campaign. Fast even for 100k contacts; returns the queued count. */
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
    const contacts = await db.contact.findMany({
      where: audienceWhere,
      orderBy: { id: "asc" },
      take: ENQUEUE_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
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

  if (queued === 0) {
    await db.campaign.update({
      where: { id: campaignId },
      data: { status: "sent", completedAt: new Date() },
    });
  } else {
    ensureSendWorker();
  }
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
    const claimedRows = await db.$queryRaw<{ id: string }[]>`
      UPDATE "Message" SET status = 'sending'
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
            const status = (err as { status?: number }).status;
            if (status === 429 && attempt < MAX_ATTEMPTS) {
              await sleep(1000 * 2 ** attempt);
              continue;
            }
            await db.message.update({
              where: { id: msg.id },
              data: {
                status: "failed",
                errorCode: status ? String(status) : null,
                errorMessage: err instanceof Error ? err.message : String(err),
              },
            });
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

/** Mark campaigns whose queue has fully drained as sent. */
async function finalizeCompletedCampaigns() {
  const sending = await db.campaign.findMany({ where: { status: "sending" }, select: { id: true } });
  for (const c of sending) {
    const remaining = await db.message.count({
      where: { campaignId: c.id, status: { in: ["pending", "sending"] } },
    });
    if (remaining === 0) {
      await db.campaign.update({
        where: { id: c.id },
        data: { status: "sent", completedAt: new Date() },
      });
    }
  }
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

/** Called from instrumentation on boot: resume any interrupted sends. */
export async function resumePendingSends() {
  // Rows stuck in `sending` from a crashed process go back to `pending`
  await db.message.updateMany({
    where: { status: "sending", direction: "outbound", twilioSid: null },
    data: { status: "pending" },
  });
  const pendingCount = await db.message.count({ where: { status: "pending", direction: "outbound" } });
  if (pendingCount > 0) ensureSendWorker();
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
  const msg = await client.messages.create({
    to: opts.to,
    messagingServiceSid: messagingServiceSid(),
    from: pickSender(await tenantSenders(opts.tenantId), opts.to),
    body: opts.body,
    mediaUrl: opts.mediaUrls,
    statusCallback: `${appBaseUrl()}/api/webhooks/twilio/status`,
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
