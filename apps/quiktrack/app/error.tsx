"use client";

import { ErrorFallback } from "@/components/error-fallback";

/**
 * Route-segment error boundary (REL-01). Catches render/data errors in any
 * segment below the root layout that lacks a more specific boundary. The root
 * layout chrome stays mounted; only the failed segment is replaced.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorFallback error={error} reset={reset} />;
}
