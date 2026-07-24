import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { advanceTenDlcRegistration } from "@/lib/tendlc";
import { generateCampaignContent, ensureCompliantMessage } from "@/lib/tendlc-ai";
import { normalizePhone } from "@/lib/phone";
import { isTwilioConfigured } from "@/lib/twilio";
import { currentTenantId } from "@/lib/tenant";

export const maxDuration = 300;

// Self-serve 10DLC registration is DISABLED: the platform sends through one
// approved Messaging Service on the main Twilio account, and purchased numbers
// join its pool automatically. Flip this to false to re-enable the wizard
// (e.g. when moving to per-tenant ISV subaccounts).
const REGISTRATION_DISABLED = true;
const DISABLED_MESSAGE =
  "10DLC registration is managed by PuffPing — your workspace already sends through our approved campaign. Purchased numbers join the sending pool automatically.";

export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const registration = await db.tenDlcRegistration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ registration });
}

// The ABSOLUTE MINIMUM the user must provide — legal/factual fields AI can't
// invent. Everything else (use case, sample messages, opt-in, vertical,
// business type) is generated + compliance-checked by AI server-side.
const REQUIRED = [
  "legalBusinessName",
  "ein",
  "website",
  "addressStreet",
  "addressCity",
  "addressState",
  "addressPostalCode",
  "contactFirstName",
  "contactLastName",
  "contactEmail",
  "contactPhone",
] as const;

export async function POST(req: NextRequest) {
  if (REGISTRATION_DISABLED) {
    return NextResponse.json({ error: DISABLED_MESSAGE, disabled: true }, { status: 503 });
  }
  const tenantId = await currentTenantId(req);
  if (!isTwilioConfigured()) {
    return NextResponse.json({ error: "Twilio is not configured" }, { status: 400 });
  }
  const body = await req.json();
  const missing = REQUIRED.filter((k) => !body[k]?.trim?.());
  if (missing.length) {
    return NextResponse.json({ error: `Missing required fields: ${missing.join(", ")}` }, { status: 400 });
  }
  const contactPhone = normalizePhone(body.contactPhone);
  if (!contactPhone) return NextResponse.json({ error: "Invalid contact phone" }, { status: 400 });

  const legalBusinessName = body.legalBusinessName.trim();

  // AI prefill: fill any campaign content the user didn't provide, and ensure
  // sample messages are compliant either way.
  const hasCampaignContent =
    body.useCaseDescription?.trim() && body.sampleMessage1?.trim() && body.sampleMessage2?.trim() && body.optInDescription?.trim();
  let generated = null as Awaited<ReturnType<typeof generateCampaignContent>> | null;
  if (!hasCampaignContent) {
    generated = await generateCampaignContent({
      businessName: legalBusinessName,
      website: body.website,
      description: body.description,
    });
  }
  const gc = generated?.content;

  const data = {
    legalBusinessName,
    businessType: body.businessType || gc?.businessType || "Limited Liability Corporation",
    ein: body.ein.replace(/\D/g, ""),
    website: body.website.trim(),
    addressStreet: body.addressStreet.trim(),
    addressCity: body.addressCity.trim(),
    addressState: body.addressState.trim(),
    addressPostalCode: body.addressPostalCode.trim(),
    vertical: body.vertical || gc?.vertical || "RETAIL",
    contactFirstName: body.contactFirstName.trim(),
    contactLastName: body.contactLastName.trim(),
    contactEmail: body.contactEmail.trim(),
    contactPhone,
    contactTitle: body.contactTitle || "Owner",
    contactJobPosition: body.contactJobPosition || "CEO",
    useCaseCategory: body.useCaseCategory || "MARKETING",
    useCaseDescription: (body.useCaseDescription?.trim() || gc?.useCaseDescription || "").slice(0, 4000),
    sampleMessage1: ensureCompliantMessage(body.sampleMessage1?.trim() || gc?.sampleMessage1 || "", legalBusinessName),
    sampleMessage2: ensureCompliantMessage(body.sampleMessage2?.trim() || gc?.sampleMessage2 || "", legalBusinessName),
    optInDescription: (body.optInDescription?.trim() || gc?.optInDescription || "").slice(0, 4000),
    optInKeywords: body.optInKeywords || gc?.optInKeywords || "START",
  };

  // Reuse a failed/draft registration row rather than duplicating.
  const existing = await db.tenDlcRegistration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  const registration =
    existing && ["draft", "failed"].includes(existing.status)
      ? await db.tenDlcRegistration.update({ where: { id: existing.id }, data: { ...data, status: "draft", failureReason: null } })
      : existing ?? (await db.tenDlcRegistration.create({ data: { ...data, tenantId } }));

  const result = await advanceTenDlcRegistration(registration.id);
  return NextResponse.json(
    { registration: result, aiUsed: generated?.aiUsed ?? false },
    { status: result.status === "failed" ? 500 : 200 }
  );
}

/** Re-poll / advance the pipeline (background auto-advance from the UI poll). */
export async function PATCH(req: NextRequest) {
  if (REGISTRATION_DISABLED) {
    return NextResponse.json({ error: DISABLED_MESSAGE, disabled: true }, { status: 503 });
  }
  const tenantId = await currentTenantId(req);
  const existing = await db.tenDlcRegistration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  if (!existing) return NextResponse.json({ error: "No registration found" }, { status: 404 });
  const result = await advanceTenDlcRegistration(existing.id);
  return NextResponse.json({ registration: result });
}
