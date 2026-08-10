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
    console.error("[quikcredflow] dashboard error:", error);
  }, [error]);

  return (
    <div className="crm-card mx-auto max-w-lg p-8 text-center">
      <h2 className="text-lg font-semibold text-crm-text">Something went wrong</h2>
      <p className="mt-2 text-sm text-crm-muted">
        {error.message || "An unexpected error occurred while loading this page."}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
      >
        Try again
      </button>
    </div>
  );
}
