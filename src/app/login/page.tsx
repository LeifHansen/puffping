import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Sign in — PuffPing" };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/dashboard");
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/puff-ping-logo.png" alt="PuffPing" className="h-14 w-auto mix-blend-multiply" />
        </Link>
        <AuthForm mode="login" />
        <p className="mt-4 text-center text-sm text-zinc-400">
          New here?{" "}
          <Link href="/signup" className="text-emerald-400 hover:underline">
            Create a workspace
          </Link>
        </p>
      </div>
    </div>
  );
}
