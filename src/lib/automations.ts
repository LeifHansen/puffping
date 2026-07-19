import type { Automation } from "@prisma/client";
import { db } from "./db";
import { isSuppressed } from "./suppression";

/**
 * Automations: keyword-triggered auto-responders and multi-step drip sequences.
 *
 * An inbound message whose (trimmed, lowercased) text matches an enabled
 * automation's trigger keyword enrolls the sender into that automation. The
 * background scheduler (src/lib/scheduler.ts) then walks each enrollment
 * through its steps, sending step N once `nextRunAt` is due and scheduling
 * step N+1 `delayMinutes` later. Delivery reuses the normal send pipeline, so
 * opt-outs and messaging-service routing apply automatically.
 */

/** ms helper kept local so tests/callers can reason about scheduling math. */
function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

/**
 * Enroll (or re-enroll) a contact into an automation, starting at step 0.
 * Re-triggering an existing enrollment restarts the sequence. Also handles the
 * optional "add to list" side effect.
 */
async function enrollContact(automation: Automation, contactId: string) {
  const steps = await db.automationStep.findMany({
    where: { automationId: automation.id },
    orderBy: { order: "asc" },
    take: 1,
  });
  if (!steps.length) return; // nothing to send
  const nextRunAt = minutesFromNow(steps[0].delayMinutes);

  await db.automationEnrollment.upsert({
    where: { automationId_contactId: { automationId: automation.id, contactId } },
    create: {
      tenantId: automation.tenantId,
      automationId: automation.id,
      contactId,
      currentStep: 0,
      status: "active",
      nextRunAt,
    },
    // Re-trigger restarts the drip from the top.
    update: { currentStep: 0, status: "active", nextRunAt },
  });

  if (automation.addToListId) {
    // Only add to a list that still belongs to the same tenant.
    const list = await db.contactList.findFirst({
      where: { id: automation.addToListId, tenantId: automation.tenantId },
      select: { id: true },
    });
    if (list) {
      await db.listMembership.upsert({
        where: { contactId_listId: { contactId, listId: list.id } },
        create: { contactId, listId: list.id },
        update: {},
      });
    }
  }
}

/**
 * Given an inbound message, enroll the sender into any enabled keyword
 * automation whose keyword matches. Creates the contact if it doesn't exist yet
 * (so a cold "text JOIN to subscribe" flow works), and clears any opt-out since
 * texting an opt-in keyword is fresh consent.
 */
export async function handleKeywordTriggers(opts: {
  tenantId: string;
  from: string;
  body: string;
  existingContactId?: string;
}) {
  const keyword = opts.body.trim().toLowerCase();
  if (!keyword) return;

  // Never (re)enroll a suppressed / DNC number.
  if (await isSuppressed(opts.tenantId, opts.from)) return;

  const matches = await db.automation.findMany({
    where: {
      tenantId: opts.tenantId,
      enabled: true,
      triggerType: "keyword",
      triggerKeyword: { not: null },
    },
  });
  const hits = matches.filter((a) => (a.triggerKeyword ?? "").trim().toLowerCase() === keyword);
  if (!hits.length) return;

  // Resolve or create the contact — a keyword opt-in may come from a number we
  // don't have yet.
  let contactId = opts.existingContactId;
  if (!contactId) {
    const contact = await db.contact.upsert({
      where: { tenantId_phone: { tenantId: opts.tenantId, phone: opts.from } },
      create: { tenantId: opts.tenantId, phone: opts.from, optedOut: false },
      update: { optedOut: false, optedOutAt: null },
    });
    contactId = contact.id;
  } else {
    await db.contact.update({
      where: { id: contactId },
      data: { optedOut: false, optedOutAt: null },
    });
  }

  for (const automation of hits) {
    await enrollContact(automation, contactId);
  }
}
