import type { TollFreeVerification } from "@prisma/client";
import { db } from "./db";
import { twilio } from "./twilio";

/**
 * Toll-free verification. Requires an owned toll-free number (buy one on the
 * Numbers page first), then submits the verification with the minimum info
 * Twilio requires. Status can be re-polled at any time.
 */
export async function submitTollFreeVerification(id: string): Promise<TollFreeVerification> {
  const reg = await db.tollFreeVerification.findUniqueOrThrow({ where: { id } });
  const client = twilio();

  try {
    if (!reg.verificationSid) {
      const verification = await client.messaging.v1.tollfreeVerifications.create({
        tollfreePhoneNumberSid: reg.phoneNumberSid,
        businessName: reg.businessName,
        businessWebsite: reg.businessWebsite,
        businessStreetAddress: reg.addressStreet,
        businessCity: reg.addressCity,
        businessStateProvinceRegion: reg.addressState,
        businessPostalCode: reg.addressPostalCode,
        businessCountry: reg.addressCountry,
        businessContactFirstName: reg.contactFirstName,
        businessContactLastName: reg.contactLastName,
        businessContactEmail: reg.contactEmail,
        businessContactPhone: reg.contactPhone,
        notificationEmail: reg.contactEmail,
        useCaseCategories: [reg.useCaseCategory],
        useCaseSummary: reg.useCaseSummary,
        productionMessageSample: reg.productionMessageSample,
        optInType: reg.optInType as "VERBAL" | "WEB_FORM" | "PAPER_FORM" | "VIA_TEXT" | "MOBILE_QR_CODE",
        optInImageUrls: reg.optInImageUrls ? (JSON.parse(reg.optInImageUrls) as string[]) : [],
        messageVolume: reg.messageVolume,
      });
      return db.tollFreeVerification.update({
        where: { id },
        data: { verificationSid: verification.sid, status: "submitted" },
      });
    }
    return refreshTollFreeStatus(id);
  } catch (err) {
    return db.tollFreeVerification.update({
      where: { id },
      data: { status: "rejected", rejectionReason: err instanceof Error ? err.message : String(err) },
    });
  }
}

export async function refreshTollFreeStatus(id: string): Promise<TollFreeVerification> {
  const reg = await db.tollFreeVerification.findUniqueOrThrow({ where: { id } });
  if (!reg.verificationSid) return reg;
  const client = twilio();
  const verification = await client.messaging.v1.tollfreeVerifications(reg.verificationSid).fetch();
  const map: Record<string, string> = {
    PENDING_REVIEW: "submitted",
    IN_REVIEW: "in_review",
    TWILIO_APPROVED: "approved",
    TWILIO_REJECTED: "rejected",
  };
  return db.tollFreeVerification.update({
    where: { id },
    data: {
      status: map[verification.status] ?? reg.status,
      rejectionReason:
        verification.status === "TWILIO_REJECTED"
          ? (verification.rejectionReason ?? "Rejected — see Twilio console for details")
          : null,
    },
  });
}
