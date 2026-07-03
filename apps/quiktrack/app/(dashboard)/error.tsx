"use client";

import { ErrorFallback } from "@/components/error-fallback";

/**
 * Dashboard-segment error boundary (REL-01). Sits inside the dashboard layout,
 * so the sidebar/header chrome remain while only the failed page area shows the
 * recoverable fallback. A throw in any dashboard page (spaces, timesheet,
 * reports, etc.) lands here instead of white-screening.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorFallback
      error={error}
      reset={reset}
      description="This page hit an unexpected error. You can retry, or return to your dashboard."
    />
  );
}
