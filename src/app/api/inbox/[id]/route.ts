import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const conversation = await db.conversation.findUnique({
    where: { id },
    include: { contact: true },
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const messages = await db.message.findMany({
    where: { OR: [{ conversationId: id }, { phone: conversation.phone }] },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  // Opening the thread marks it read
  if (conversation.unreadCount > 0) {
    await db.conversation.update({ where: { id }, data: { unreadCount: 0 } });
  }

  return NextResponse.json({ conversation, messages });
}
