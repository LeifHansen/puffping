import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { claimNumber, SlotError } from "@/lib/slots";
import { canManage } from "@/lib/team";
import { isTwilioConfigured } from "@/lib/twilio";

type Params = { params: Promise<{ id: string }> };

/**
 * Claim a number into a paid slot ({ phoneNumber }). The number is bought,
 * attached to the slot's campaign, and can send once carrier registration
 * completes. Owner/admin only.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) {
    return NextResponse.json({ error: "Only owners/admins can claim numbers" }, { status: 403 });
  }
  if (!isTwilioConfigured()) return NextResponse.json({ error: "Twilio is not configured" }, { status: 400 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const number = await claimNumber(id, session.tenantId, String(body.phoneNumber ?? ""));
    return NextResponse.json({ number });
  } catch (err) {
    if (err instanceof SlotError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[puffping] claim failed:", err);
    return NextResponse.json({ error: "Claim failed — please try again." }, { status: 500 });
  }
}
