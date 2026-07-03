"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@quikit/ui";

/**
 * Shared fallback UI for App Router error boundaries (REL-01). Rendered by
 * `app/error.tsx`, `app/(dashboard)/error.tsx`, and `app/global-error.tsx`
 * so that a render throw shows a recoverable screen with a working retry
 * instead of white-screening the app. `reset()` re-renders the failed segment.
 */
export function ErrorFallback({
  error,
  reset,
  title = "Something went wrong",
  description = "This section hit an unexpected error. You can retry, or head back to your dashboard.",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
}) {
  useEffect(() => {
    // Surface the error for observability. We log only the error object Next.js
    // already captured — never user/prompt content.
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4 p-8 text-center"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="max-w-md text-sm text-gray-600">{description}</p>
        {error.digest && (
          <p className="text-xs text-gray-400">Reference: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="primary" size="md" onClick={() => reset()}>
          Try again
        </Button>
        <Button
          variant="outline"
          size="md"
          onClick={() => {
            window.location.href = "/";
          }}
        >
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}
