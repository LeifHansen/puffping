import { NextRequest, NextResponse } from "next/server";
import { generateMessageCopy, isAiConfigured } from "@/lib/ai";

export async function POST(req: NextRequest) {
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI is not configured. Set ANTHROPIC_API_KEY in your environment." },
      { status: 400 }
    );
  }
  const body = await req.json();
  if (!body.prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }
  try {
    const variants = await generateMessageCopy({
      prompt: body.prompt,
      currentDraft: body.currentDraft || undefined,
      variants: Math.min(5, Math.max(1, Number(body.variants ?? 1))),
    });
    return NextResponse.json({ variants });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
