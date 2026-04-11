"use client";

import { useEffect } from "react";

/**
 * Error boundary for the OPSP page. Especially important because this page
 * is 2200+ lines of inline form state — a render error could otherwise
 * crash the whole dashboard.
 */
export default function OpspError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[OPSP feature error]", error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-4 p-6">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        OPSP couldn&apos;t load
      </h2>
      <p className="max-w-md text-center text-sm text-[var(--color-text-secondary)]">
        {error.message || "An unexpected error occurred in the One Page Strategic Plan."}
      </p>
      <p className="max-w-md text-center text-xs text-[var(--color-text-tertiary)]">
        Your unsaved draft (if any) is still in local storage and will be restored on the next successful load.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-neutral-100)] transition-colors"
        >
          Back to Dashboard
        </a>
      </div>
    </div>
  );
}
