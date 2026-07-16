import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { advanceTenDlcRegistration } from "@/lib/tendlc";
import { normalizePhone } from "@/lib/phone";
import { isTwilioConfigured } from "@/lib/twilio";
import { currentTenantId } from "@/lib/tenant";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const registration = await db.tenDlcRegistration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ registration });
}

const REQUIRED = [
  "legalBusinessName",
  "businessType",
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
  "useCaseDescription",
  "sampleMessage1",
  "sampleMessage2",
  "optInDescription",
] as const;

/** Create (or update the draft of) the 10DLC registration and run the pipeline. */
export async function POST(req: NextRequest) {
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

  const data = {
    legalBusinessName: body.legalBusinessName.trim(),
    businessType: body.businessType,
    ein: body.ein.replace(/\D/g, ""),
    website: body.website.trim(),
    addressStreet: body.addressStreet.trim(),
    addressCity: body.addressCity.trim(),
    addressState: body.addressState.trim(),
    addressPostalCode: body.addressPostalCode.trim(),
    vertical: body.vertical || "RETAIL",
    contactFirstName: body.contactFirstName.trim(),
    contactLastName: body.contactLastName.trim(),
    contactEmail: body.contactEmail.trim(),
    contactPhone,
    contactTitle: body.contactTitle || "Owner",
    contactJobPosition: body.contactJobPosition || "CEO",
    useCaseCategory: body.useCaseCategory || "MARKETING",
    useCaseDescription: body.useCaseDescription.trim(),
    sampleMessage1: body.sampleMessage1.trim(),
    sampleMessage2: body.sampleMessage2.trim(),
    optInDescription: body.optInDescription.trim(),
  };

  // Reuse a failed/draft registration row rather than duplicating
  const existing = await db.tenDlcRegistration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  const registration =
    existing && ["draft", "failed"].includes(existing.status)
      ? await db.tenDlcRegistration.update({ where: { id: existing.id }, data: { ...data, status: "draft", failureReason: null } })
      : existing ?? (await db.tenDlcRegistration.create({ data: { ...data, tenantId } }));

  const result = await advanceTenDlcRegistration(registration.id);
  return NextResponse.json({ registration: result }, { status: result.status === "failed" ? 500 : 200 });
}

/** Re-poll / advance the pipeline (e.g. after Twilio review completes). */
export async function PATCH(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const existing = await db.tenDlcRegistration.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  if (!existing) return NextResponse.json({ error: "No registration found" }, { status: 404 });
  const result = await advanceTenDlcRegistration(existing.id);
  return NextResponse.json({ registration: result });
}
