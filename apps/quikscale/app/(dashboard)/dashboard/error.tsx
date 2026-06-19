"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[Dashboard feature error]", error);
  }, [error]);

  return (
    <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-4 p-6">
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Dashboard couldn&apos;t load
      </h2>
      <p className="max-w-md text-center text-sm text-[var(--color-text-secondary)]">
        {error.message || "An unexpected error occurred loading your dashboard overview."}
      </p>
      <button
        onClick={reset}
        className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
      >
        Try again
      </button>
    </div>
  );
}
