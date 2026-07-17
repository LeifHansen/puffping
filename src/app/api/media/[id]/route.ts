import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";
import { deleteBytes } from "@/lib/media";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  const tenantId = await currentTenantId(req);
  const { id } = await params;
  const asset = await db.mediaAsset.findFirst({ where: { id, tenantId } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await deleteBytes(asset.storagePath).catch(() => {});
  await db.mediaAsset.delete({ where: { id: asset.id } });
  return NextResponse.json({ ok: true });
}
