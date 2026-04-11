"use client";

import { useEffect } from "react";

/**
 * Error boundary scoped to the KPI feature. Catches render errors from
 * /kpi, /kpi/teams, and nested detail pages without taking down the rest
 * of the dashboard.
 */
export default function KpiError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[KPI feature error]", error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-4 p-6">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        KPI section couldn&apos;t load
      </h2>
      <p className="max-w-md text-center text-sm text-[var(--color-text-secondary)]">
        {error.message || "An unexpected error occurred in the KPI module."}
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
