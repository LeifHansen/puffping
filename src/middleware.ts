import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

// Protected app UI sections (redirect to /login when signed out).
const PROTECTED_PAGES = [
  "/dashboard",
  "/campaigns",
  "/inbox",
  "/contacts",
  "/templates",
  "/numbers",
  "/compliance",
  "/media",
  "/automations",
];

// Tenant-scoped API prefixes (401 when signed out). Auth + webhooks stay public.
const PROTECTED_API = [
  "/api/contacts",
  "/api/lists",
  "/api/templates",
  "/api/campaigns",
  "/api/inbox",
  "/api/numbers",
  "/api/registration",
  "/api/dashboard",
  "/api/ai",
  "/api/media",
  "/api/automations",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  if (hasSession) return NextResponse.next();

  if (PROTECTED_API.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Run on app pages and api, skip Next internals + static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
