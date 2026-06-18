"use client";

import { useEffect } from "react";
import { signIn, useSession } from "next-auth/react";

/**
 * Client gate for authenticated pages. Central QuikIT SSO drives auth now:
 * middleware redirects unauthenticated page requests to /login, and this guard
 * waits for the NextAuth session so protected content never flashes. If the
 * session is missing/expired it re-triggers SSO sign-in.
 *
 * Non-production uses the header-based dev no-login flow (no NextAuth session),
 * so the guard does not gate there — local API auth is handled by withAuth's
 * dev headers instead.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const isDev = process.env.NODE_ENV !== "production";

  useEffect(() => {
    if (!isDev && status === "unauthenticated") {
      const path = typeof window !== "undefined" ? window.location.pathname : "/dashboard";
      signIn("quikit", { callbackUrl: path });
    }
  }, [status, isDev]);

  if (isDev) return <>{children}</>;
  if (status !== "authenticated") return null;
  return <>{children}</>;
}
