"use client";

import { signIn, useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Login route — auto-triggers QuikIT SSO sign-in. No local credentials form;
 * SSO via @quikit/auth is the only supported flow. Exists so middleware has a
 * redirect target.
 */
export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      // Land on "/" so its server-side, permission-aware redirect picks the
      // right page (/dashboard for admins, /employee-view for plain Members) —
      // never hardcode /dashboard, which 403s for Members into a dead spinner.
      void signIn("quikit", { callbackUrl: "/" });
    }
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500">Redirecting to sign-in…</p>
    </div>
  );
}
