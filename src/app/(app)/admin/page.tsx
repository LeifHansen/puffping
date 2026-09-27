import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import AdminConsole from "./admin-console";

/** Platform admin (PuffPing operators only — PLATFORM_ADMIN_EMAILS). */
export default async function AdminPage() {
  const session = await getSessionUser();
  if (!session || !isPlatformAdmin(session.email)) notFound();
  return <AdminConsole />;
}
