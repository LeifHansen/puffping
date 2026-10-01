import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { NO_SENDING_NUMBER, NoSendingNumberError, sendDirectMessage } from "@/lib/send";
import { currentTenantId } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  const body = await req.json();
  if (!body.body?.trim() && !body.mediaUrl) {
    return NextResponse.json({ error: "Message body is required" }, { status: 400 });
  }
  const conversation = await db.conversation.findFirst({ where: { id, tenantId } });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await sendDirectMessage({
      tenantId,
      to: conversation.phone,
      body: body.body ?? "",
      mediaUrls: body.mediaUrl ? [body.mediaUrl] : undefined,
      conversationId: id,
      contactId: conversation.contactId ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NoSendingNumberError) {
      return NextResponse.json({ error: err.message, code: NO_SENDING_NUMBER }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 500 }
    );
  }
}
