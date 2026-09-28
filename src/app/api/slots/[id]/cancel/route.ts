import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { setSlotCancellation, SlotError } from "@/lib/slots";
import { canManage } from "@/lib/team";

type Params = { params: Promise<{ id: string }> };

/**
 * Cancel a slot at the end of its paid period ({ resume: true } undoes it).
 * The number is released and the slot returns to inventory when the period
 * ends. Owner/admin only.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManage(session.role)) {
    return NextResponse.json({ error: "Only owners/admins can cancel number slots" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const result = await setSlotCancellation(id, session.tenantId, !body.resume);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SlotError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[puffping] slot cancel failed:", err);
    return NextResponse.json({ error: "Couldn't update the subscription — please try again." }, { status: 502 });
  }
}
