import { NextRequest, NextResponse } from "next/server";
import { isTwilioConfigured, twilio } from "@/lib/twilio";

/**
 * Shop for available numbers. `type` = local | tollfree, optional `areaCode`
 * and `contains` (digit/letter pattern). Only SMS+MMS capable numbers.
 */
export async function GET(req: NextRequest) {
  if (!isTwilioConfigured()) {
    return NextResponse.json({ error: "Twilio is not configured" }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") === "tollfree" ? "tollfree" : "local";
  const areaCode = searchParams.get("areaCode");
  const contains = searchParams.get("contains");

  const opts: { smsEnabled: boolean; mmsEnabled: boolean; limit: number; areaCode?: number; contains?: string } = {
    smsEnabled: true,
    mmsEnabled: true,
    limit: 20,
  };
  if (areaCode && type === "local") opts.areaCode = Number(areaCode);
  if (contains) opts.contains = contains;

  try {
    const client = twilio();
    const available =
      type === "tollfree"
        ? await client.availablePhoneNumbers("US").tollFree.list(opts)
        : await client.availablePhoneNumbers("US").local.list(opts);

    return NextResponse.json({
      numbers: available.map((n) => ({
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        locality: n.locality,
        region: n.region,
        capabilities: n.capabilities,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Number search failed" },
      { status: 500 }
    );
  }
}
