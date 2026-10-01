import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { platformAdminSession } from "@/lib/platform-admin";
import { addCampaign, availableSlotCount, SlotError } from "@/lib/slots";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

/** Platform admin: campaign inventory, fill levels, and numbers needing attention. */
export async function GET() {
  if (!(await platformAdminSession())) return notFound();

  const [campaigns, counts, attention, unslotted, available] = await Promise.all([
    db.messagingCampaign.findMany({ orderBy: { createdAt: "asc" } }),
    db.numberSlot.groupBy({ by: ["campaignId", "status"], _count: { _all: true } }),
    db.phoneNumber.findMany({
      where: { status: { in: ["pending_registration", "registration_failed"] } },
      orderBy: { purchasedAt: "asc" },
      select: {
        id: true,
        phoneNumber: true,
        status: true,
        registrationError: true,
        purchasedAt: true,
        tenant: { select: { name: true } },
      },
    }),
    db.phoneNumber.findMany({
      where: { slot: { is: null } },
      orderBy: { purchasedAt: "asc" },
      select: { id: true, phoneNumber: true, numberType: true, tenant: { select: { name: true } } },
    }),
    availableSlotCount(),
  ]);

  return NextResponse.json({
    available,
    campaigns: campaigns.map((c) => {
      const byStatus: Record<string, number> = {};
      for (const row of counts) if (row.campaignId === c.id) byStatus[row.status] = row._count._all;
      return { ...c, slots: byStatus };
    }),
    attention,
    unslotted,
  });
}

/** Platform admin: add an approved campaign ({ messagingServiceSid, name?, capacity? }) → creates its slots. */
export async function POST(req: NextRequest) {
  if (!(await platformAdminSession())) return notFound();
  const body = await req.json().catch(() => ({}));
  try {
    const result = await addCampaign({
      messagingServiceSid: String(body.messagingServiceSid ?? ""),
      name: body.name ? String(body.name) : undefined,
      capacity: body.capacity === undefined || body.capacity === "" ? undefined : Number(body.capacity),
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof SlotError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[puffping] add campaign failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Add campaign failed" }, { status: 500 });
  }
}
