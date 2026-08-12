"use client";

import { useEffect } from "react";

/**
 * Root-segment error boundary.
 *
 * Covers everything OUTSIDE the (dashboard) group — the (marketing) landing
 * page, /login, /portal and /auth-handoff. Previously only (dashboard)/error.tsx
 * and global-error.tsx existed, leaving those segments to fall all the way
 * through to the global boundary (which replaces the whole document) for what
 * is usually a recoverable render error.
 *
 * Mirrors apps/quiktrack/app/error.tsx.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[quikcrmexpress] route error", error);
  }, [error]);

  return (
    <main
      role="alert"
      className="flex min-h-screen items-center justify-center bg-gray-50 p-8"
    >
      <div className="max-w-lg text-center">
        <h1 className="text-xl font-semibold text-gray-900">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          This page couldn&apos;t be displayed. Trying again often clears it.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-gray-400">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-700"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:border-gray-400"
          >
            Go home
          </a>
        </div>
      </div>
    </main>
  );
}
