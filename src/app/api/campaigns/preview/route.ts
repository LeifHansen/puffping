import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { renderTemplate, segmentCount } from "@/lib/render";

/** Preview a message body rendered against a real contact + audience size. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const listIds: string[] = Array.isArray(body.listIds) ? body.listIds : [];

  const [audience, sample] = await Promise.all([
    listIds.length
      ? db.contact.count({ where: { optedOut: false, memberships: { some: { listId: { in: listIds } } } } })
      : Promise.resolve(0),
    listIds.length
      ? db.contact.findFirst({ where: { optedOut: false, memberships: { some: { listId: { in: listIds } } } } })
      : db.contact.findFirst(),
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
