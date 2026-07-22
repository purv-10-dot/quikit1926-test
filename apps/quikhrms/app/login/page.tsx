"use client";

import { Suspense, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { ForceLightMode } from "@/components/hrms/force-light-mode";

/**
 * QuikHRMS login — SSO via QuikIT. There is no local HRMS login form.
 *
 * Auto-triggers the OAuth flow to QuikIT: the user is already logged in on
 * QuikIT → auth code issued → token exchanged → session created → user lands
 * on /hrms. If they are not yet logged in on QuikIT, QuikIT shows its login.
 */

// SSO is only wired up when the QuikIT IdP URL is present. Without it (local
// dev), auto-triggering signIn("quikit") would redirect to a non-existent IdP
// and loop, so we show a hint instead and let the header-based dev flow run.
const SSO_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_QUIKIT_URL);

function LoginInner() {
  const { status } = useSession();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";

  useEffect(() => {
    if (SSO_CONFIGURED && status === "unauthenticated" && !error) {
      signIn("quikit", { callbackUrl });
    }
  }, [status, callbackUrl, error]);

  // Dev / misconfig: SSO not set up — don't loop. Point the user to the app.
  if (!SSO_CONFIGURED) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <p className="text-sm font-medium text-amber-800">
              QuikIT SSO is not configured (NEXT_PUBLIC_QUIKIT_URL is unset).
              Set the QuikIT env vars to enable SSO, or continue in local dev.
            </p>
          </div>
          <a
            href="/dashboard"
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
          >
            Go to HRMS
          </a>
        </div>
      </div>
    );
  }

  // OAuth error — show a helpful message with retry.
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
            <p className="text-sm font-medium text-red-800">
              {error === "session_expired"
                ? "Your session has expired. Please log in again."
                : error === "OAuthCallback"
                ? "Could not complete sign-in. Make sure you are logged in on QuikIT first."
                : `Authentication error: ${error}`}
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <a
              // Falls back to same-origin /login when NEXT_PUBLIC_QUIKIT_URL is
              // unset (which re-triggers this page's signIn("quikit") on mount).
              href={`${process.env.NEXT_PUBLIC_QUIKIT_URL ?? ""}/login`}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
            >
              Go to QuikIT Login
            </a>
            <button
              onClick={() => signIn("quikit", { callbackUrl })}
              className="px-4 py-2 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state while redirecting to QuikIT.
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
        <p className="text-sm text-gray-500">Signing in via QuikIT…</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      {/* Login keeps a fixed light design — never follow the app dark theme. */}
      <ForceLightMode />
      <LoginInner />
    </Suspense>
  );
}
