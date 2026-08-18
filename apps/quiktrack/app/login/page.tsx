"use client";

import { signIn, useSession } from "next-auth/react";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeInternalPath } from "@/lib/utils/safe-redirect";

const DEFAULT_POST_LOGIN = "/dashboard";

/**
 * Login route — auto-triggers QuikIT SSO sign-in.
 *
 * Don't add a custom username/password form here. SSO via @quikit/auth is the
 * only supported flow. This page exists so middleware has somewhere to redirect.
 *
 * `callbackUrl` is the deep-link contract: `createMiddleware` appends the
 * originally-requested path when it bounces an unauthenticated user here (see
 * packages/auth/middleware.ts). Hardcoding `/dashboard` on sign-in threw that
 * away, so someone opening an emailed "View task" link while logged out landed
 * on the dashboard and had to hunt for the ticket. Honour the param instead.
 */
function LoginRedirect() {
  const { status } = useSession();
  const router = useRouter();
  const callbackUrl = safeInternalPath(
    useSearchParams().get("callbackUrl"),
    DEFAULT_POST_LOGIN,
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      void signIn("quikit", { callbackUrl });
    }
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [status, router, callbackUrl]);

  return <Redirecting />;
}

function Redirecting() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <p className="text-sm text-gray-500">Redirecting to sign-in…</p>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary in the app router.
  return (
    <Suspense fallback={<Redirecting />}>
      <LoginRedirect />
    </Suspense>
  );
}
