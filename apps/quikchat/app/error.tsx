"use client";

import { useEffect } from "react";

/**
 * Route-segment error boundary. Catches render/data errors below the root
 * layout; the root chrome stays mounted and only the failed segment is
 * replaced. (Server-side error tracking happens via Next's own digest logging
 * — we do NOT import the Node-only Sentry tracker into this client bundle.)
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("QuikChat route error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-bg-primary)] p-6 text-center text-[var(--color-text-primary)]">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">
        QuikChat hit an unexpected error. You can retry, or head back to your workspace.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium hover:bg-[var(--color-bg-secondary)]"
        >
          Back to QuikChat
        </a>
      </div>
    </div>
  );
}
