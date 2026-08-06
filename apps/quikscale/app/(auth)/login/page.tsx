"use client";

import { useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

/**
 * QuikScale login — SSO via QuikIT.
 *
 * Auto-triggers the OAuth flow to QuikIT. The user is already logged in
 * on QuikIT → auth code issued → token exchanged → session created →
 * user lands on dashboard. No login form shown.
 */

export default function LoginPage() {
  const { status } = useSession();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  useEffect(() => {
    if (status === "unauthenticated" && !error) {
      signIn("quikit", { callbackUrl });
    }
  }, [status, callbackUrl, error]);

  // OAuth error — show a helpful message with retry
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-4">
            <p className="text-sm font-medium text-red-800">
              {error === "OAuthCallback"
                ? "Could not complete sign-in. Make sure you are logged in on QuikIT first."
                : `Authentication error: ${error}`}
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <a
              // Falls back to same-origin /login when NEXT_PUBLIC_QUIKIT_URL is
              // unset (which re-triggers this page's signIn("quikit") flow on
              // mount). Removed the http://localhost:3000 fallback so prod
              // builds missing the env var don't leak a localhost redirect.
              href={`${process.env.NEXT_PUBLIC_QUIKIT_URL ?? ""}/login`}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
            >
              Go to QuikIT Login
            </a>
            <button
              onClick={() => signIn("quikit", { callbackUrl: "/dashboard" })}
              className="px-4 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl border border-indigo-200 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state while redirecting to QuikIT
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4" />
        <p className="text-sm text-gray-500">Signing in via QuikIT...</p>
      </div>
    </div>
  );
}
