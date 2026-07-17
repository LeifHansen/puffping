import Anthropic from "@anthropic-ai/sdk";

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

const SYSTEM = `You are PuffPing's SMS marketing copywriter. Write high-converting, compliant SMS/MMS marketing copy.

Rules:
- Keep messages short. Prefer a single SMS segment (under 160 GSM-7 characters) unless the user asks for longer.
- Support dynamic fields with double curly braces, e.g. {{first_name}}, {{last_name}}, plus any custom fields the user mentions. Use {{first_name|there}} style fallbacks when personalizing greetings.
- Marketing messages must be compliant: include the brand name and opt-out language ("Reply STOP to opt out") unless the user explicitly says the messaging service appends it automatically.
- No emojis unless the user asks. No ALL-CAPS spam patterns, no misleading claims, nothing that would violate carrier content policies (SHAFT: sex, hate, alcohol, firearms, tobacco/cannabis restrictions apply to SMS).
- Return ONLY the message text, no commentary or quotation marks. If asked for multiple variants, return one per line.`;

export async function generateMessageCopy(opts: {
  prompt: string;
  currentDraft?: string;
  variants?: number;
}): Promise<string[]> {
  const { prompt, currentDraft, variants = 1 } = opts;
  const userContent = [
    currentDraft ? `Current draft:\n${currentDraft}\n` : "",
    `Request: ${prompt}`,
    variants > 1 ? `\nProduce ${variants} distinct variants, one per line.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await anthropic().messages.create({
    model: "claude-opus-4-8",
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The AI declined to generate this content. Adjust your request and try again.");
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (variants > 1) {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, variants);
  }
  return [text];
}
