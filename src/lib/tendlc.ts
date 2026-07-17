import type { TenDlcRegistration } from "@prisma/client";
import { db } from "./db";
import { appBaseUrl, twilio } from "./twilio";

/**
 * Fully automated A2P 10DLC registration against Twilio.
 *
 * Pipeline (each step persists the Twilio SID so it is resumable/idempotent):
 *  1. Secondary Customer Profile (TrustHub) + business info + authorized rep + address
 *  2. Submit profile for vetting
 *  3. US A2P Trust Product (messaging profile)
 *  4. Brand registration (Low-Volume/Standard)
 *  5. Messaging Service wired to our webhooks
 *  6. US A2P campaign on the messaging service
 *
 * The user supplies only the absolute minimum Twilio requires: legal business
 * info + EIN, one authorized contact, and the campaign use-case description.
 */

// Well-known Twilio TrustHub policy SIDs (stable, documented constants)
const SECONDARY_PROFILE_POLICY_SID = "RNdfbf3fae0e1107f8aded0e58cad877cf";
const A2P_TRUST_PRODUCT_POLICY_SID = "RNb0d4771c2c98518d916a3d4cd70a8f8b";

export async function advanceTenDlcRegistration(id: string): Promise<TenDlcRegistration> {
  let reg = await db.tenDlcRegistration.findUniqueOrThrow({ where: { id } });
  const client = twilio();

  try {
    // ---- Step 1: Secondary customer profile bundle ----
    if (!reg.customerProfileSid) {
      const profile = await client.trusthub.v1.customerProfiles.create({
        friendlyName: `${reg.legalBusinessName} - Secondary Profile`,
        email: reg.contactEmail,
        policySid: SECONDARY_PROFILE_POLICY_SID,
      });

      const businessInfo = await client.trusthub.v1.endUsers.create({
        friendlyName: `${reg.legalBusinessName} - Business Info`,
        type: "customer_profile_business_information",
        attributes: {
          business_name: reg.legalBusinessName,
          business_identity: "direct_customer",
          business_type: reg.businessType,
          business_industry: reg.vertical,
          business_registration_identifier: "EIN",
          business_registration_number: reg.ein,
          business_regions_of_operation: "USA_AND_CANADA",
          website_url: reg.website,
          social_media_profile_urls: "",
        },
      });

      const rep = await client.trusthub.v1.endUsers.create({
        friendlyName: `${reg.legalBusinessName} - Authorized Rep`,
        type: "authorized_representative_1",
        attributes: {
          first_name: reg.contactFirstName,
          last_name: reg.contactLastName,
          email: reg.contactEmail,
          phone_number: reg.contactPhone,
          business_title: reg.contactTitle,
          job_position: reg.contactJobPosition,
        },
      });

      const address = await client.addresses.create({
        customerName: reg.legalBusinessName,
        street: reg.addressStreet,
        city: reg.addressCity,
        region: reg.addressState,
        postalCode: reg.addressPostalCode,
        isoCountry: reg.addressCountry,
      });
      const addressDoc = await client.trusthub.v1.supportingDocuments.create({
        friendlyName: `${reg.legalBusinessName} - Address`,
        type: "customer_profile_address",
        attributes: { address_sids: address.sid },
      });

      for (const objectSid of [businessInfo.sid, rep.sid, addressDoc.sid]) {
        await client.trusthub.v1
          .customerProfiles(profile.sid)
          .customerProfilesEntityAssignments.create({ objectSid });
      }

      reg = await db.tenDlcRegistration.update({
        where: { id },
        data: { customerProfileSid: profile.sid, currentStep: "customer_profile_created", status: "submitting" },
      });
    }

    // ---- Step 2: Evaluate + submit the customer profile ----
    const profileStatus = await client.trusthub.v1.customerProfiles(reg.customerProfileSid!).fetch();
    if (profileStatus.status === "draft") {
      const evaluation = await client.trusthub.v1
        .customerProfiles(reg.customerProfileSid!)
        .customerProfilesEvaluations.create({ policySid: SECONDARY_PROFILE_POLICY_SID });
      if (evaluation.status === "noncompliant") {
        throw new Error(
          "Customer profile is missing required information: " +
            JSON.stringify(evaluation.results?.filter((r: { passed: boolean }) => !r.passed) ?? [])
        );
      }
      await client.trusthub.v1
        .customerProfiles(reg.customerProfileSid!)
        .update({ status: "pending-review" });
      reg = await db.tenDlcRegistration.update({
        where: { id },
        data: { currentStep: "customer_profile_submitted", status: "pending_review" },
      });
    }

    // ---- Step 3: A2P trust product ----
    if (!reg.trustProductSid) {
      const trustProduct = await client.trusthub.v1.trustProducts.create({
        friendlyName: `${reg.legalBusinessName} - A2P Messaging Profile`,
        email: reg.contactEmail,
        policySid: A2P_TRUST_PRODUCT_POLICY_SID,
      });
      const a2pInfo = await client.trusthub.v1.endUsers.create({
        friendlyName: `${reg.legalBusinessName} - A2P Info`,
        type: "us_a2p_messaging_profile_information",
        attributes: { company_type: "private" },
      });
      await client.trusthub.v1
        .trustProducts(trustProduct.sid)
        .trustProductsEntityAssignments.create({ objectSid: a2pInfo.sid });
      await client.trusthub.v1
        .trustProducts(trustProduct.sid)
        .trustProductsEntityAssignments.create({ objectSid: reg.customerProfileSid! });
      await client.trusthub.v1
        .trustProducts(trustProduct.sid)
        .trustProductsEvaluations.create({ policySid: A2P_TRUST_PRODUCT_POLICY_SID });
      await client.trusthub.v1.trustProducts(trustProduct.sid).update({ status: "pending-review" });

      reg = await db.tenDlcRegistration.update({
        where: { id },
        data: { trustProductSid: trustProduct.sid, currentStep: "trust_product_submitted" },
      });
    }

    // ---- Step 4: Brand registration ----
    if (!reg.brandSid) {
      const brand = await client.messaging.v1.brandRegistrations.create({
        customerProfileBundleSid: reg.customerProfileSid!,
        a2PProfileBundleSid: reg.trustProductSid!,
      });
      reg = await db.tenDlcRegistration.update({
        where: { id },
        data: { brandSid: brand.sid, currentStep: "brand_submitted" },
      });
    }

    // Poll brand status
    const brand = await client.messaging.v1.brandRegistrations(reg.brandSid!).fetch();
    if (brand.status === "FAILED") {
      throw new Error(
        `Brand registration failed: ${JSON.stringify(brand.failureReason ?? "see Twilio console")}`
      );
    }
    if (brand.status !== "APPROVED") {
      return db.tenDlcRegistration.update({
        where: { id },
        data: { currentStep: "awaiting_brand_approval", status: "pending_review" },
      });
    }
    if (reg.status !== "brand_approved" && !reg.campaignSid) {
      reg = await db.tenDlcRegistration.update({
        where: { id },
        data: { status: "brand_approved", currentStep: "brand_approved" },
      });
    }

    // ---- Step 5: Messaging service ----
    if (!reg.messagingServiceSid) {
      const service = await client.messaging.v1.services.create({
        friendlyName: `PuffPing - ${reg.legalBusinessName}`,
        inboundRequestUrl: `${appBaseUrl()}/api/webhooks/twilio/inbound`,
        inboundMethod: "POST",
        statusCallback: `${appBaseUrl()}/api/webhooks/twilio/status`,
        useInboundWebhookOnNumber: false,
      });
      reg = await db.tenDlcRegistration.update({
        where: { id },
        data: { messagingServiceSid: service.sid, currentStep: "messaging_service_created" },
      });
      // Make this the tenant's active sending service (multi-tenant framework:
      // falls through tenantMessagingServiceSid before the global env var).
      await db.tenant.update({
        where: { id: reg.tenantId },
        data: { twilioMessagingServiceSid: service.sid },
      });
    }

    // ---- Step 6: A2P campaign on the messaging service ----
    if (!reg.campaignSid) {
      const campaign = await client.messaging.v1
        .services(reg.messagingServiceSid!)
        .usAppToPerson.create({
          brandRegistrationSid: reg.brandSid!,
          description: reg.useCaseDescription,
          messageFlow: reg.optInDescription,
          messageSamples: [reg.sampleMessage1, reg.sampleMessage2].filter(Boolean),
          usAppToPersonUsecase: reg.useCaseCategory,
          hasEmbeddedLinks: true,
          hasEmbeddedPhone: false,
          subscriberOptIn: true,
          ageGated: false,
          directLending: false,
          optInKeywords: reg.optInKeywords.split(",").map((k) => k.trim()).filter(Boolean),
          optInMessage: `${reg.legalBusinessName}: You are now opted in to marketing messages. Msg&Data rates may apply. Reply HELP for help, STOP to opt out.`,
          optOutKeywords: ["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"],
          optOutMessage: `${reg.legalBusinessName}: You have been unsubscribed and will receive no further messages.`,
          helpKeywords: ["HELP", "INFO"],
          helpMessage: `${reg.legalBusinessName}: For help contact ${reg.contactEmail}. Reply STOP to opt out.`,
        });
      reg = await db.tenDlcRegistration.update({
        where: { id },
        data: { campaignSid: campaign.sid, currentStep: "campaign_submitted", status: "campaign_pending" },
      });
    }

    // Poll campaign status
    const campaignStatus = await client.messaging.v1
      .services(reg.messagingServiceSid!)
      .usAppToPerson(reg.campaignSid!)
      .fetch();
    if (campaignStatus.campaignStatus === "FAILED") {
      throw new Error("A2P campaign was rejected. Check the use case description and samples, then resubmit.");
    }
    if (campaignStatus.campaignStatus === "VERIFIED") {
      return db.tenDlcRegistration.update({
        where: { id },
        data: { status: "registered", currentStep: "complete" },
      });
    }
    return db.tenDlcRegistration.update({
      where: { id },
      data: { currentStep: "awaiting_campaign_approval", status: "campaign_pending" },
    });
  } catch (err) {
    return db.tenDlcRegistration.update({
      where: { id },
      data: {
        status: "failed",
        failureReason: err instanceof Error ? err.message : String(err),
      },
    });
  }
}
