import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";
import { sendingNumberStatus } from "@/lib/send";

/** The workspace's numbers, plus whether it can send (it needs at least one). */
export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const [numbers, sending] = await Promise.all([
    db.phoneNumber.findMany({ where: { tenantId }, orderBy: { purchasedAt: "desc" } }),
    sendingNumberStatus(tenantId),
  ]);
  return NextResponse.json({ numbers, sending });
}
