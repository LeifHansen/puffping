import { isOpenAiConfigured, openai, OPENAI_VISION_MODEL } from "./openai-client";

export type CampaignContent = {
  businessType: string;
  vertical: string;
  useCaseDescription: string;
  sampleMessage1: string;
  sampleMessage2: string;
  optInDescription: string;
  optInKeywords: string;
};

const VERTICALS = [
  "RETAIL", "REAL_ESTATE", "HEALTHCARE", "ENERGY", "ENTERTAINMENT", "INSURANCE",
  "AGRICULTURE", "EDUCATION", "HOSPITALITY", "FINANCIAL", "GAMBLING", "CONSTRUCTION",
  "NGO", "MANUFACTURING", "GOVERNMENT", "TECHNOLOGY", "COMMUNICATION",
];
const BUSINESS_TYPES = [
  "Sole Proprietorship", "Partnership", "Limited Liability Corporation", "Corporation",
  "Co-operative", "Non-profit Corporation",
];

/**
 * Ensure a sample message is A2P 10DLC / Twilio compliant regardless of what the
 * model produced: brand name present + explicit opt-out language. This is a
 * safety net so registrations aren't rejected for missing required elements.
 */
export function ensureCompliantMessage(msg: string, brand: string): string {
  let out = (msg || "").trim();
  if (brand && !out.toLowerCase().includes(brand.toLowerCase())) {
    out = `${brand}: ${out}`;
  }
  if (!/\bstop\b/i.test(out)) {
    out = `${out.replace(/\s+$/, "")} Reply STOP to opt out.`;
  }
  return out;
}

function fallbackContent(businessName: string): CampaignContent {
  return {
    businessType: "Limited Liability Corporation",
    vertical: "RETAIL",
    useCaseDescription: `Marketing and promotional messages from ${businessName} to customers who opted in to receive texts, including sales announcements, discount codes, and product updates.`,
    sampleMessage1: `${businessName}: Hi {{first_name}}! Everything is 20% off this weekend. Show this text at checkout. Msg&Data rates may apply. Reply STOP to opt out.`,
    sampleMessage2: `${businessName}: {{first_name}}, your favorites are back in stock — grab them before they're gone. Reply HELP for help, STOP to opt out.`,
    optInDescription: `Customers opt in by submitting their phone number on the ${businessName} website signup form or by texting a keyword to our number, consenting to recurring marketing messages. Message and data rates may apply.`,
    optInKeywords: "START,JOIN",
  };
}

/**
 * Use OpenAI to prefill as much of the 10DLC campaign registration as possible
 * from minimal inputs (business name + website + optional description), and
 * guarantee the sample messages are compliant. Falls back to safe, compliant
 * defaults if OpenAI isn't configured or errors.
 */
export async function generateCampaignContent(input: {
  businessName: string;
  website?: string;
  description?: string;
}): Promise<{ content: CampaignContent; aiUsed: boolean }> {
  const brand = input.businessName.trim();
  if (!isOpenAiConfigured()) {
    return { content: fallbackContent(brand), aiUsed: false };
  }

  try {
    const res = await openai().chat.completions.create({
      model: OPENAI_VISION_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You prepare U.S. A2P 10DLC campaign registrations for Twilio. Output MUST be compliant: " +
            "every sample message includes the brand name and explicit opt-out language (\"Reply STOP to opt out\"); " +
            "no SHAFT content (sex, hate, alcohol, firearms, tobacco/cannabis), no misleading claims, no unauthorized content. " +
            "Sample messages should read like real marketing texts (may use {{first_name}} personalization), stay under 320 chars, " +
            "and at least one should mention that message & data rates may apply. Respond ONLY with JSON.",
        },
        {
          role: "user",
          content:
            `Business name: ${brand}\n` +
            (input.website ? `Website: ${input.website}\n` : "") +
            (input.description ? `About: ${input.description}\n` : "") +
            "\nReturn JSON with keys: " +
            `{"businessType": one of ${JSON.stringify(BUSINESS_TYPES)}, ` +
            `"vertical": one of ${JSON.stringify(VERTICALS)}, ` +
            '"useCaseDescription": string (2-3 sentences describing the marketing use case to opted-in customers), ' +
            '"sampleMessage1": string, "sampleMessage2": string, ' +
            '"optInDescription": string (how end users consent to receive messages), ' +
            '"optInKeywords": string (comma-separated, e.g. "START,JOIN")}',
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
    });
    const p = JSON.parse(res.choices[0]?.message?.content ?? "{}");
    const fb = fallbackContent(brand);
    const content: CampaignContent = {
      businessType: BUSINESS_TYPES.includes(p.businessType) ? p.businessType : fb.businessType,
      vertical: VERTICALS.includes(p.vertical) ? p.vertical : fb.vertical,
      useCaseDescription: String(p.useCaseDescription || fb.useCaseDescription).slice(0, 4000),
      sampleMessage1: ensureCompliantMessage(String(p.sampleMessage1 || fb.sampleMessage1), brand),
      sampleMessage2: ensureCompliantMessage(String(p.sampleMessage2 || fb.sampleMessage2), brand),
      optInDescription: String(p.optInDescription || fb.optInDescription).slice(0, 4000),
      optInKeywords: String(p.optInKeywords || fb.optInKeywords).slice(0, 200),
    };
    return { content, aiUsed: true };
  } catch {
    return { content: fallbackContent(brand), aiUsed: false };
  }
}
