import { db } from "./db";
import { queueCampaign, sendDirectMessage } from "./send";
import { renderTemplate } from "./render";

/**
 * Background scheduler (singleton per Node process).
 *
 * Every tick it does two things:
 *  1. Launches campaigns whose `scheduledAt` is due (status "scheduled").
 *  2. Advances automation drip enrollments whose `nextRunAt` is due, sending
 *     the current step and scheduling the next.
 *
 * A reentrancy guard prevents overlapping ticks within a process; the singleton
 * interval prevents multiple schedulers per process. Cross-machine safety comes
 * from the atomic status-conditioned claims below (campaign launch) — only one
 * machine wins each claim.
 */

const TICK_MS = 30_000;
const ENROLLMENT_BATCH = 200;

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
      data: { status: "sending", startedAt: new Date() },
    });
    if (claim.count === 0) continue;
    try {
      await queueCampaign(c.id);
    } catch (err) {
      await db.campaign.update({
        where: { id: c.id },
        data: {
          status: "failed",
          // reuse startedAt; no dedicated error column on Campaign
        },
      });
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
