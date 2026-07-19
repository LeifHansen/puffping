import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";
import { mediaPublicUrl, optimizeImageForMms, readBytes, saveBytes } from "@/lib/media";

export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/** "Optimize for Mobile": OpenAI-planned + sharp-executed MMS optimization,
 *  saved as a new derivative asset. */
export async function POST(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  const source = await db.mediaAsset.findFirst({ where: { id, tenantId } });
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (source.kind !== "image") {
    return NextResponse.json({ error: "Only images can be optimized for MMS" }, { status: 400 });
  }

  try {
    const bytes = await readBytes(source.storagePath);
    const result = await optimizeImageForMms(bytes, source.mimeType);
    const storagePath = await saveBytes(result.output, "jpg");

    const baseName = source.filename.replace(/\.[^.]+$/, "");
    const asset = await db.mediaAsset.create({
      data: {
        tenantId,
        kind: "image",
        filename: `${baseName}-mobile.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: result.output.length,
        width: result.width,
        height: result.height,
        storagePath,
        optimizedForMobile: true,
        sourceAssetId: source.id,
        altText: result.altText,
      },
    });

    return NextResponse.json({
      asset: { ...asset, url: mediaPublicUrl(asset.id) },
      warnings: result.warnings,
      aiUsed: result.aiUsed,
      savedBytes: source.sizeBytes - result.output.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Optimization failed" },
      { status: 500 }
    );
  }
}
