import { NextResponse } from "next/server";
import { platformAdminSession } from "@/lib/platform-admin";
import { ensureRegistrationEventStream } from "@/lib/registration-events";
import { isTwilioConfigured } from "@/lib/twilio";

/** Platform admin: connect Twilio Event Streams so numbers go active when registration completes. */
export async function POST() {
  if (!(await platformAdminSession())) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isTwilioConfigured()) return NextResponse.json({ error: "Twilio is not configured" }, { status: 400 });
  try {
    return NextResponse.json(await ensureRegistrationEventStream());
  } catch (err) {
    console.error("[puffping] event stream setup failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Setup failed" }, { status: 502 });
  }
}
