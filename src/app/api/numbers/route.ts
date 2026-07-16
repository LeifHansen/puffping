import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const numbers = await db.phoneNumber.findMany({ orderBy: { purchasedAt: "desc" } });
  return NextResponse.json({ numbers });
}
