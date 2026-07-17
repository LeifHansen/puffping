// Edge-safe constant shared by middleware (Edge runtime) and auth.ts (Node).
// Kept in its own module so middleware doesn't pull in Prisma / node:crypto.
export const SESSION_COOKIE = "puffping_session";
