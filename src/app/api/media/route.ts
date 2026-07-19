import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";
import { imageDimensions, kindFromMime, mediaPublicUrl, saveBytes } from "@/lib/media";

export const maxDuration = 120;

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

export async function GET(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const assets = await db.mediaAsset.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ assets: assets.map((a) => ({ ...a, url: mediaPublicUrl(a.id) })) });
}

export async function POST(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Upload a file in the `file` field" }, { status: 400 });
  }
  const kind = kindFromMime(file.type);
  if (!kind) {
    return NextResponse.json({ error: "Only image and video files are supported" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File is too large (max 20MB)" }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const storagePath = await saveBytes(bytes, ext);
  const dims = kind === "image" ? await imageDimensions(bytes) : {};

  const asset = await db.mediaAsset.create({
    data: {
      tenantId,
      kind,
      filename: file.name || `upload.${ext || kind}`,
      mimeType: file.type,
      sizeBytes: file.size,
      width: dims.width,
      height: dims.height,
      storagePath,
    },
  });
  return NextResponse.json({ asset: { ...asset, url: mediaPublicUrl(asset.id) } }, { status: 201 });
}
