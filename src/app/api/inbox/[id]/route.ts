import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  const conversation = await db.conversation.findFirst({
    where: { id, tenantId },
    include: { contact: true },
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await db.message.findMany({
    where: { tenantId, OR: [{ conversationId: id }, { phone: conversation.phone }] },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  // Opening the thread marks it read
  if (conversation.unreadCount > 0) {
    await db.conversation.update({ where: { id }, data: { unreadCount: 0 } });
  }

  return NextResponse.json({ conversation, messages });
}
