import { NextResponse } from "next/server";

/**
 * DISABLED: self-serve 10DLC registration is platform-managed — every
 * workspace sends through PuffPing's approved Messaging Service, so there is
 * nothing for AI to prefill. Restore from git history (and re-enable the
 * wizard in ../route.ts) if per-tenant registration returns.
 */
export async function POST() {
  return NextResponse.json(
    { error: "10DLC registration is managed by PuffPing.", disabled: true },
    { status: 503 }
  );
}
