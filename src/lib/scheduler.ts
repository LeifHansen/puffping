import { db } from "./db";
import { NoSendingNumberError, queueCampaign, resumePendingSends, sendDirectMessage } from "./send";
import { renderTemplate } from "./render";
import { refreshPendingTollFreeVerifications } from "./tollfree";

/**
 * Background scheduler (singleton per Node process).
 *
 * Every tick it does two things:
 *  1. Launches campaigns whose `scheduledAt` is due (status "scheduled").
 *  2. Advances automation drip enrollments whose `nextRunAt` is due, sending
 *     the current step and scheduling the next.
 *
 *  3. Requeues send-queue rows orphaned by a dead worker (stale claims).
 *  4. Polls toll-free verifications under review (approval unblocks sending).
 *
 * A reentrancy guard prevents overlapping ticks within a process; the singleton
 * interval prevents multiple schedulers per process. Cross-machine safety comes
 * from atomic conditional claims — a status-conditioned claim per campaign
 * launch and a nextRunAt lease per drip step — so only one machine wins each.
 */

const TICK_MS = 30_000;
const ENROLLMENT_BATCH = 200;
// A leased drip step is retried after this if its machine dies mid-send.
const ENROLLMENT_LEASE_MS = 5 * 60_000;
// A drip step whose workspace has no sending number waits this long, then retries.
const NO_NUMBER_RETRY_MS = 60 * 60_000;
// Each pending toll-free verification is re-checked with Twilio at most this often.
const TOLLFREE_POLL_MS = 10 * 60_000;

const g = globalThis as unknown as {
  __puffpingScheduler?: ReturnType<typeof setInterval>;
  __puffpingSchedulerRunning?: boolean;
};

export function ensureScheduler() {
  if (g.__puffpingScheduler) return;
  g.__puffpingScheduler = setInterval(() => void tick(), TICK_MS);
  void tick();
}

async function tick() {
  if (g.__puffpingSchedulerRunning) return; // don't let ticks overlap
  g.__puffpingSchedulerRunning = true;
  try {
    await launchDueCampaigns();
    await processDueEnrollments();
    await resumePendingSends();
    await refreshPendingTollFreeVerifications({ staleMs: TOLLFREE_POLL_MS, limit: 25 });
  } catch (err) {
    console.error("[puffping] scheduler tick failed:", err);
  } finally {
    g.__puffpingSchedulerRunning = false;
  }
}

/** Fire any scheduled campaign whose time has arrived. */
async function launchDueCampaigns() {
  const due = await db.campaign.findMany({
    where: { status: "scheduled", scheduledAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const c of due) {
    // Claim atomically so a concurrent tick can't double-launch.
    const claim = await db.campaign.updateMany({
      where: { id: c.id, status: "scheduled" },
      data: { status: "sending", startedAt: new Date(), enqueuedAt: null, failureReason: null },
    });
    if (claim.count === 0) continue;
    try {
      await queueCampaign(c.id);
    } catch (err) {
      // Rows already queued still send; a retry only queues the rest.
      const failureReason =
        err instanceof NoSendingNumberError ? err.message : "The scheduled send couldn't start — use Send now to retry.";
      await db.campaign.update({ where: { id: c.id }, data: { status: "failed", failureReason } });
      console.error(`[puffping] scheduled campaign ${c.id} failed to launch:`, err);
    }
  }
}

/** Advance drip enrollments that are due for their next step. */
async function processDueEnrollments() {
  const due = await db.automationEnrollment.findMany({
    where: { status: "active", nextRunAt: { lte: new Date() } },
    orderBy: { nextRunAt: "asc" },
    take: ENROLLMENT_BATCH,
    include: {
      contact: true,
      automation: { include: { steps: { orderBy: { order: "asc" } } } },
    },
  });

  for (const e of due) {
    // Cancel if the automation was disabled or the contact opted out.
    if (!e.automation.enabled || e.contact.optedOut) {
      await db.automationEnrollment.update({
        where: { id: e.id },
        data: { status: "cancelled" },
      });
      continue;
    }

    // Lease the step before sending: only the tick (on any machine) whose
    // conditional update wins may send it — the rest see count 0 and skip.
    const lease = await db.automationEnrollment.updateMany({
      where: { id: e.id, status: "active", currentStep: e.currentStep, nextRunAt: e.nextRunAt },
      data: { nextRunAt: new Date(Date.now() + ENROLLMENT_LEASE_MS) },
    });
    if (lease.count === 0) continue;

    const step = e.automation.steps[e.currentStep];
    if (!step) {
      await db.automationEnrollment.update({
        where: { id: e.id },
        data: { status: "completed" },
      });
      continue;
    }

    try {
      const body = renderTemplate(step.body, e.contact);
      if (body.trim() || step.mediaUrl) {
        await sendDirectMessage({
          tenantId: e.tenantId,
          to: e.contact.phone,
          body,
          mediaUrls: step.mediaUrl ? [step.mediaUrl] : undefined,
          contactId: e.contactId,
        });
      }
    } catch (err) {
      if (err instanceof NoSendingNumberError) {
        // Don't burn the step: hold it (same step) and retry later, so the drip
        // resumes once the workspace has a number again.
        await db.automationEnrollment.update({
          where: { id: e.id },
          data: { nextRunAt: new Date(Date.now() + NO_NUMBER_RETRY_MS) },
        });
        continue;
      }
      // Log and still advance so one bad step doesn't wedge the enrollment.
      console.error(`[puffping] automation step send failed (enrollment ${e.id}):`, err);
    }

    const next = e.currentStep + 1;
    const nextStep = e.automation.steps[next];
    if (nextStep) {
      // Schedule from the step's DUE time, not from now — tick latency must not
      // compound into drift across a long sequence.
      const base = Math.max(e.nextRunAt.getTime(), Date.now() - TICK_MS);
      await db.automationEnrollment.update({
        where: { id: e.id },
        data: { currentStep: next, nextRunAt: new Date(base + nextStep.delayMinutes * 60_000) },
      });
    } else {
      await db.automationEnrollment.update({
        where: { id: e.id },
        data: { currentStep: next, status: "completed" },
      });
    }
  }
}
