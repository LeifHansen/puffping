import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "workspace";
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const workspaceName = String(body.workspaceName ?? "").trim() || "My Workspace";
  const name = String(body.name ?? "").trim() || null;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });
  }

  // Unique tenant slug
  const base = slugify(workspaceName);
  let slug = base;
  for (let i = 0; await db.tenant.findUnique({ where: { slug } }); i++) {
    slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (i > 5) break;
  }

  const passwordHash = await hashPassword(password);

  // Create the workspace, the user, and the owner membership together.
  const user = await db.user.create({
    data: {
      email,
      name,
      passwordHash,
      memberships: {
        create: {
          role: "owner",
          tenant: { create: { slug, name: workspaceName } },
        },
      },
    },
  });

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
