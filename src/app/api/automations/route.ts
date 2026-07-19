import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const automations = await db.automation.findMany({
    where: { tenantId },
    include: {
      steps: { orderBy: { order: "asc" } },
      _count: { select: { enrollments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Active enrollment counts per automation (for the "N in progress" badge).
  const active = await db.automationEnrollment.groupBy({
    by: ["automationId"],
    where: { tenantId, status: "active" },
    _count: true,
  });
  const activeById = Object.fromEntries(active.map((a) => [a.automationId, a._count]));

  return NextResponse.json({
    automations: automations.map((a) => ({ ...a, activeEnrollments: activeById[a.id] ?? 0 })),
  });
}

type StepInput = { delayMinutes?: number; body?: string; mediaUrl?: string | null };

function normalizeSteps(raw: unknown): { order: number; delayMinutes: number; body: string; mediaUrl: string | null }[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s: StepInput, i) => ({
      order: i,
      delayMinutes: Math.max(0, Math.floor(Number(s.delayMinutes ?? 0)) || 0),
      body: String(s.body ?? "").trim(),
      mediaUrl: s.mediaUrl ? String(s.mediaUrl) : null,
    }))
    .filter((s) => s.body || s.mediaUrl);
}

export async function POST(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const body = await req.json().catch(() => ({}));

  const name = String(body.name ?? "").trim();
  const triggerType = body.triggerType === "manual" ? "manual" : "keyword";
  const triggerKeyword =
    triggerType === "keyword" ? String(body.triggerKeyword ?? "").trim() : "";
  const steps = normalizeSteps(body.steps);

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (triggerType === "keyword" && !triggerKeyword) {
    return NextResponse.json({ error: "A trigger keyword is required" }, { status: 400 });
  }
  if (!steps.length) {
    return NextResponse.json({ error: "Add at least one message step" }, { status: 400 });
  }

  // Keyword must be unique per tenant so inbound routing is unambiguous.
  if (triggerType === "keyword") {
    const clash = await db.automation.findFirst({
      where: { tenantId, triggerType: "keyword", triggerKeyword: { equals: triggerKeyword } },
    });
    if (clash) {
      return NextResponse.json(
        { error: `Keyword "${triggerKeyword}" is already used by another automation` },
        { status: 409 }
      );
    }
  }

  const addToListId = body.addToListId
    ? (await db.contactList.findFirst({ where: { id: String(body.addToListId), tenantId }, select: { id: true } }))?.id ?? null
    : null;

  const automation = await db.automation.create({
    data: {
      tenantId,
      name,
      triggerType,
      triggerKeyword: triggerType === "keyword" ? triggerKeyword : null,
      addToListId,
      enabled: body.enabled !== false,
      steps: { create: steps },
    },
    include: { steps: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ automation }, { status: 201 });
}
