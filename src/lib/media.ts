import { promises as fs } from "fs";
import path from "path";
import { randomBytes } from "crypto";
import sharp from "sharp";
import { appBaseUrl } from "./twilio";
import { isOpenAiConfigured, openai, OPENAI_VISION_MODEL } from "./openai-client";

// Where uploaded media lives. On Fly, mount a volume and set MEDIA_DIR so
// uploads persist across deploys (otherwise the machine's disk is ephemeral).
function mediaDir(): string {
  return process.env.MEDIA_DIR || path.join(process.cwd(), "uploads");
}

/** Public, auth-free URL Twilio (and <img>) fetch the bytes from. */
export function mediaPublicUrl(id: string): string {
  return `${appBaseUrl()}/api/media-raw/${id}`;
}

export function kindFromMime(mime: string): "image" | "video" | null {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return null;
}

/** Save raw bytes to the media dir, return the relative storage path. */
export async function saveBytes(bytes: Buffer, ext: string): Promise<string> {
  const dir = mediaDir();
  await fs.mkdir(dir, { recursive: true });
  const name = `${randomBytes(16).toString("hex")}${ext ? "." + ext.replace(/^\./, "") : ""}`;
  await fs.writeFile(path.join(dir, name), bytes);
  return name;
}

export async function readBytes(storagePath: string): Promise<Buffer> {
  return fs.readFile(path.join(mediaDir(), storagePath));
}

export async function deleteBytes(storagePath: string): Promise<void> {
  await fs.rm(path.join(mediaDir(), storagePath), { force: true });
}

/** Image dimensions, best-effort. */
export async function imageDimensions(bytes: Buffer): Promise<{ width?: number; height?: number }> {
  try {
    const meta = await sharp(bytes).metadata();
    return { width: meta.width, height: meta.height };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// MMS optimization
// ---------------------------------------------------------------------------

const MMS_MAX_LONG_EDGE = 1440; // px — carrier-friendly upper bound
const MMS_TARGET_BYTES = 500 * 1024; // ~500KB (Twilio recommends < 600KB)

type OptimizePlan = {
  longEdge: number;
  quality: number;
  warnings: string[];
  altText: string | null;
  aiUsed: boolean;
};

/**
 * Ask OpenAI (vision) to assess the image and recommend MMS settings. Returns a
 * safe default plan if OpenAI isn't configured or the call fails — the actual
 * pixel work is always done deterministically by sharp so content is preserved.
 */
async function planOptimization(bytes: Buffer, mime: string): Promise<OptimizePlan> {
  const fallback: OptimizePlan = {
    longEdge: MMS_MAX_LONG_EDGE,
    quality: 80,
    warnings: [],
    altText: null,
    aiUsed: false,
  };
  if (!isOpenAiConfigured()) return fallback;

  try {
    const dataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
    const res = await openai().chat.completions.create({
      model: OPENAI_VISION_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You optimize marketing images for MMS delivery on phones. MMS images should be small (well under 600KB), " +
            "have a long edge no larger than 1440px, and remain legible on a phone screen. Preserve the original content — " +
            "do not suggest changing what the image depicts. Respond ONLY with JSON.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Assess this image for MMS and return JSON with keys: " +
                '{"longEdge": number (max px for the long edge, 640-1440), ' +
                '"quality": number (JPEG quality 55-85), ' +
                '"warnings": string[] (e.g. text too small to read on a phone, low contrast, very busy — empty if fine), ' +
                '"altText": string (a concise 1-line description for accessibility)}',
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 400,
    });
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}");
    return {
      longEdge: clamp(Number(parsed.longEdge) || MMS_MAX_LONG_EDGE, 640, MMS_MAX_LONG_EDGE),
      quality: clamp(Number(parsed.quality) || 80, 55, 85),
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String).slice(0, 5) : [],
      altText: typeof parsed.altText === "string" ? parsed.altText.slice(0, 300) : null,
      aiUsed: true,
    };
  } catch {
    return { ...fallback, warnings: ["AI analysis unavailable — applied default MMS optimization."] };
  }
}

/**
 * Produce an MMS-optimized JPEG from the source image bytes. Uses OpenAI to plan
 * (dimensions/quality/warnings/alt-text) and sharp to execute, then iterates
 * quality/size until under the target byte budget.
 */
export async function optimizeImageForMms(
  bytes: Buffer,
  mime: string
): Promise<{ output: Buffer; width: number; height: number; warnings: string[]; altText: string | null; aiUsed: boolean }> {
  const plan = await planOptimization(bytes, mime);

  let longEdge = plan.longEdge;
  let quality = plan.quality;
  let output = await renderJpeg(bytes, longEdge, quality);

  // Shrink until under the MMS byte budget (bounded attempts).
  for (let i = 0; i < 6 && output.length > MMS_TARGET_BYTES; i++) {
    if (quality > 60) quality -= 8;
    else longEdge = Math.round(longEdge * 0.85);
    output = await renderJpeg(bytes, longEdge, quality);
  }

  const meta = await sharp(output).metadata();
  return {
    output,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    warnings: plan.warnings,
    altText: plan.altText,
    aiUsed: plan.aiUsed,
  };
}

async function renderJpeg(bytes: Buffer, longEdge: number, quality: number): Promise<Buffer> {
  return sharp(bytes)
    .rotate() // honor EXIF orientation
    .resize(longEdge, longEdge, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
