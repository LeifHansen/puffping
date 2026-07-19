import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { renderTemplate, segmentCount } from "@/lib/render";
import { currentTenantId } from "@/lib/tenant";
import { parseDefinition, segmentWhere } from "@/lib/segments";
import type { Prisma } from "@prisma/client";

/** Preview a message body rendered against a real contact + audience size. */
export async function POST(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const body = await req.json();
  const rawListIds: string[] = Array.isArray(body.listIds) ? body.listIds : [];
  const segmentId: string | null = body.segmentId ? String(body.segmentId) : null;

  // Resolve the audience filter: a segment when chosen, else the selected lists.
  let audienceWhere: Prisma.ContactWhereInput | null = null;
  if (segmentId) {
    const seg = await db.segment.findFirst({ where: { id: segmentId, tenantId } });
    if (seg) audienceWhere = segmentWhere(tenantId, parseDefinition(seg.definition));
  } else if (rawListIds.length) {
    const listIds = (
      await db.contactList.findMany({ where: { tenantId, id: { in: rawListIds } }, select: { id: true } })
    ).map((l) => l.id);
    if (listIds.length) {
      audienceWhere = { tenantId, optedOut: false, memberships: { some: { listId: { in: listIds } } } };
    }
  }

  const [audience, sample] = await Promise.all([
    audienceWhere ? db.contact.count({ where: audienceWhere }) : Promise.resolve(0),
    audienceWhere
      ? db.contact.findFirst({ where: audienceWhere })
      : db.contact.findFirst({ where: { tenantId } }),
  ]);

  const rendered = sample
    ? renderTemplate(body.body ?? "", sample)
    : (body.body ?? "").replace(/\{\{\s*first_name\s*(?:\|([^}]*))?\}\}/g, "$1");

  return NextResponse.json({
    audience,
    rendered,
    segments: segmentCount(rendered),
  });
}
