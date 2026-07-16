import { db } from "./db";
import { renderTemplate, segmentCount } from "./render";
import { appBaseUrl, messagingServiceSid, twilio } from "./twilio";

/**
 * Campaign sending at scale (hundreds → 100,000+ contacts).
 *
 * Design: the API request only ENQUEUES — it bulk-inserts `pending` message
 * rows in batches and returns immediately. A singleton background worker
 * drains the queue with bounded concurrency, retries Twilio 429s with
 * backoff, and survives restarts (instrumentation resumes any pending rows
 * on boot). Twilio's Messaging Service handles number pooling and carrier
 * throughput; delivery outcomes arrive via the status webhook.
 */

const ENQUEUE_BATCH = 1000; // contacts fetched/rendered per DB round-trip
const SEND_CONCURRENCY = 25; // concurrent Twilio API calls
const CLAIM_BATCH = 250; // pending rows claimed per worker cycle
const MAX_ATTEMPTS = 3;

/** Enqueue a campaign. Fast even for 100k contacts; returns the queued count. */
export async function queueCampaign(campaignId: string): Promise<{ queued: number }> {
  const campaign = await db.campaign.findUniqueOrThrow({
    where: { id: campaignId },
    include: { lists: true },
  });
  if (!messagingServiceSid()) {
    throw new Error(
      "No Messaging Service configured. Complete 10DLC or toll-free registration first, or set TWILIO_MESSAGING_SERVICE_SID."
    );
  }

  await db.campaign.update({
    where: { id: campaignId },
    data: { status: "sending", startedAt: new Date() },
  });

  const listIds = campaign.lists.map((l) => l.listId);
  const mediaUrls = campaign.mediaUrl ? JSON.stringify([campaign.mediaUrl]) : null;
  let queued = 0;
  let cursor: string | undefined;

  for (;;) {
    const contacts = await db.contact.findMany({
      where: { optedOut: false, memberships: { some: { listId: { in: listIds } } } },
      orderBy: { id: "asc" },
      take: ENQUEUE_BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!contacts.length) break;
    cursor = contacts[contacts.length - 1].id;

    const rows = contacts
      .map((contact) => {
        const body = renderTemplate(campaign.body, contact);
        if (!body.trim() && !mediaUrls) return null;
        return {
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

export function ensureSendWorker() {
  if (g.__puffpingWorker) return;
  g.__puffpingWorker = true;
  void workerLoop().finally(() => {
    g.__puffpingWorker = false;
  });
}

async function workerLoop() {
  const serviceSid = messagingServiceSid();
  if (!serviceSid) return;
  const client = twilio();
  const statusCallback = `${appBaseUrl()}/api/webhooks/twilio/status`;

  for (;;) {
    const pending = await db.message.findMany({
      where: { status: "pending", direction: "outbound" },
      orderBy: { createdAt: "asc" },
      take: CLAIM_BATCH,
    });
    if (!pending.length) break;

    // Claim the batch so a second worker (dev hot-reload) won't double-send
    await db.message.updateMany({
      where: { id: { in: pending.map((m) => m.id) } },
      data: { status: "sending" },
    });

    const queue = [...pending];
    async function sender() {
      for (;;) {
        const msg = queue.shift();
        if (!msg) return;
        let attempt = 0;
        for (;;) {
          attempt++;
          try {
            const res = await client.messages.create({
              to: msg.phone,
              messagingServiceSid: serviceSid!,
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
  to: string;
  body: string;
  mediaUrls?: string[];
  conversationId?: string;
  contactId?: string;
}): Promise<string> {
  const serviceSid = messagingServiceSid();
  if (!serviceSid) throw new Error("No Messaging Service configured.");
  const client = twilio();
  const msg = await client.messages.create({
    to: opts.to,
    messagingServiceSid: serviceSid,
    body: opts.body,
    mediaUrl: opts.mediaUrls,
    statusCallback: `${appBaseUrl()}/api/webhooks/twilio/status`,
  });
  const record = await db.message.create({
    data: {
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
