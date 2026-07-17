import { NextRequest, NextResponse } from "next/server";
import { generateCampaignContent } from "@/lib/tendlc-ai";

/**
 * Preview the AI-generated 10DLC campaign content from minimal inputs, so the
 * user can review/edit before submitting. Uses OpenAI when configured; returns
 * compliant defaults otherwise.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const businessName = String(body.businessName ?? "").trim();
  if (!businessName) {
    return NextResponse.json({ error: "Business name is required" }, { status: 400 });
  }
  const { content, aiUsed } = await generateCampaignContent({
    businessName,
    website: body.website,
    description: body.description,
  });
  return NextResponse.json({ content, aiUsed });
}
