import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { platformAdminSession } from "@/lib/platform-admin";

type Params = { params: Promise<{ id: string }> };

/** Platform admin: retire / reactivate a campaign ({ status }). Retired campaigns sell no new slots; existing numbers keep sending. */
export async function PATCH(req: NextRequest, { params }: Params) {
  if (!(await platformAdminSession())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (body.status !== "active" && body.status !== "retired") {
    return NextResponse.json({ error: "status must be active or retired" }, { status: 400 });
  }
  const res = await db.messagingCampaign.updateMany({ where: { id }, data: { status: body.status } });
  if (!res.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
