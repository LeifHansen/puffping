import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const conversations = await db.conversation.findMany({
    include: { contact: true },
    orderBy: { lastMessageAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ conversations });
}
