import { NextRequest, NextResponse } from "next/server";
import { generateMessageCopy, isAiConfigured } from "@/lib/ai";
import { getSessionUser } from "@/lib/auth";

const MAX_INPUT_CHARS = 2000;

export async function POST(req: NextRequest) {
  // Middleware only checks that a session cookie is present; this is a paid
  // API, so require a real session.
  if (!(await getSessionUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAiConfigured()) {
    return NextResponse.json(
      { error: "AI is not configured. Set ANTHROPIC_API_KEY in your environment." },
      { status: 400 }
    );
  }
  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const currentDraft = typeof body?.currentDraft === "string" ? body.currentDraft : "";
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }
  if (prompt.length > MAX_INPUT_CHARS || currentDraft.length > MAX_INPUT_CHARS) {
    return NextResponse.json({ error: `Keep the prompt and draft under ${MAX_INPUT_CHARS} characters` }, { status: 400 });
  }
  try {
    const variants = await generateMessageCopy({
      prompt,
      currentDraft: currentDraft || undefined,
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
