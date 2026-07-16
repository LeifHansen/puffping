import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";

export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const conversations = await db.conversation.findMany({
    where: { tenantId },
    include: { contact: true },
    orderBy: { lastMessageAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ conversations });
}
