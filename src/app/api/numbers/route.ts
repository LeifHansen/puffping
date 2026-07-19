import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const numbers = await db.phoneNumber.findMany({ where: { tenantId }, orderBy: { purchasedAt: "desc" } });
  return NextResponse.json({ numbers });
}
