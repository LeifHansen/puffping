import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { platformAdminSession } from "@/lib/platform-admin";

type Params = { params: Promise<{ id: string }> };

/**
 * Platform admin override: mark a number's carrier registration complete
 * (e.g. confirmed in the Twilio console when no registration event arrived).
 */
export async function POST(_req: Request, { params }: Params) {
  if (!(await platformAdminSession())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { id } = await params;
  const res = await db.phoneNumber.updateMany({
    where: { id, status: { not: "active" } },
    data: { status: "active", registrationError: null },
  });
  return NextResponse.json({ updated: res.count });
}
