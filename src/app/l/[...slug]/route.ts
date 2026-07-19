import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Public click-tracking redirect: /l/<code> or /l/<code>/<contactId>.
 * Logs the click (attributing it to the contact when present) and 302s to the
 * original URL. No auth — the code is an unguessable capability key.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const [code, contactId] = slug ?? [];
  const fallback = new URL("/", req.url);

  if (!code) return NextResponse.redirect(fallback, 302);

  const link = await db.trackedLink.findUnique({ where: { code } });
  if (!link) return NextResponse.redirect(fallback, 302);

  // Only allow http(s) targets (defense-in-depth against open-redirect abuse).
  let target: URL;
  try {
    target = new URL(link.targetUrl);
    if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("bad protocol");
  } catch {
    return NextResponse.redirect(fallback, 302);
  }

  // Attribute to the contact only if it belongs to the link's tenant.
  let attributedContactId: string | null = null;
  if (contactId) {
    const contact = await db.contact.findFirst({
      where: { id: contactId, tenantId: link.tenantId },
      select: { id: true },
    });
    attributedContactId = contact?.id ?? null;
  }

  // Log the click + bump the denormalized counter. Best-effort: never block the
  // redirect on a logging failure.
  try {
    await db.$transaction([
      db.linkClick.create({
        data: {
          tenantId: link.tenantId,
          trackedLinkId: link.id,
          contactId: attributedContactId,
          userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
        },
      }),
      db.trackedLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } }),
    ]);
  } catch {
    // swallow — redirect regardless
  }

  return NextResponse.redirect(target, 302);
}
