import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { renderTemplate, segmentCount } from "@/lib/render";
import { currentTenantId } from "@/lib/tenant";

/** Preview a message body rendered against a real contact + audience size. */
export async function POST(req: NextRequest) {
  const tenantId = await currentTenantId(req);
  const body = await req.json();
  const rawListIds: string[] = Array.isArray(body.listIds) ? body.listIds : [];

  // Constrain to lists owned by this tenant.
  const listIds = rawListIds.length
    ? (
        await db.contactList.findMany({
          where: { tenantId, id: { in: rawListIds } },
          select: { id: true },
        })
      ).map((l) => l.id)
    : [];

  const [audience, sample] = await Promise.all([
    listIds.length
      ? db.contact.count({ where: { tenantId, optedOut: false, memberships: { some: { listId: { in: listIds } } } } })
      : Promise.resolve(0),
    listIds.length
      ? db.contact.findFirst({ where: { tenantId, optedOut: false, memberships: { some: { listId: { in: listIds } } } } })
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
