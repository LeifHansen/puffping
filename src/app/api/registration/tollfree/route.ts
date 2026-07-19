import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { refreshTollFreeStatus, submitTollFreeVerification } from "@/lib/tollfree";
import { isTwilioConfigured } from "@/lib/twilio";
import { currentTenantId } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const verifications = await db.tollFreeVerification.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ verifications });
}

const REQUIRED = [
  "phoneNumberSid",
  "phoneNumber",
  "businessName",
  "businessWebsite",
  "addressStreet",
  "addressCity",
  "addressState",
  "addressPostalCode",
  "contactFirstName",
  "contactLastName",
  "contactEmail",
  "contactPhone",
  "useCaseSummary",
  "productionMessageSample",
] as const;

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

  const verification = await db.tollFreeVerification.create({
    data: {
      tenantId,
      phoneNumberSid: body.phoneNumberSid,
      phoneNumber: body.phoneNumber,
      businessName: body.businessName.trim(),
      businessWebsite: body.businessWebsite.trim(),
      addressStreet: body.addressStreet.trim(),
      addressCity: body.addressCity.trim(),
      addressState: body.addressState.trim(),
      addressPostalCode: body.addressPostalCode.trim(),
      contactFirstName: body.contactFirstName.trim(),
      contactLastName: body.contactLastName.trim(),
      contactEmail: body.contactEmail.trim(),
      contactPhone,
      optInType: body.optInType || "VERBAL",
      optInImageUrls: body.optInImageUrls?.length ? JSON.stringify(body.optInImageUrls) : null,
      useCaseCategory: body.useCaseCategory || "MARKETING",
      useCaseSummary: body.useCaseSummary.trim(),
      productionMessageSample: body.productionMessageSample.trim(),
      messageVolume: body.messageVolume || "10,000",
    },
  });

  const result = await submitTollFreeVerification(verification.id);
  return NextResponse.json({ verification: result }, { status: result.status === "rejected" ? 500 : 200 });
}

export async function PATCH(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const body = await req.json().catch(() => ({}));
  const id = body.id as string | undefined;
  const target = id
    ? await db.tollFreeVerification.findFirst({ where: { id, tenantId } })
    : await db.tollFreeVerification.findFirst({ where: { tenantId }, orderBy: { createdAt: "desc" } });
  if (!target) return NextResponse.json({ error: "No verification found" }, { status: 404 });
  const result = await refreshTollFreeStatus(target.id);
  return NextResponse.json({ verification: result });
}
