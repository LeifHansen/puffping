import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { readBytes } from "@/lib/media";

// Public, auth-free byte serving so Twilio (and <img>/<video>) can fetch MMS
// media. Access is by unguessable asset id (capability URL) — intentionally NOT
// listed under the middleware-protected /api/media prefix.
type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const asset = await db.mediaAsset.findUnique({ where: { id } });
  if (!asset) return new NextResponse("Not found", { status: 404 });
  try {
    const bytes = await readBytes(asset.storagePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(bytes.length),
        "Cache-Control": "public, max-age=31536000, immutable",
        // Defense-in-depth: never execute anything served from here on the app
        // origin, and never let the browser second-guess the content type.
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
