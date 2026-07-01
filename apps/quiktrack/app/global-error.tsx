"use client";

import { ErrorFallback } from "@/components/error-fallback";
import "./globals.css";

/**
 * Root error boundary (REL-01). This is the last line of defence: it catches
 * errors thrown by the root layout itself, so it must render its own
 * <html>/<body> (the root layout is exactly what failed and is unavailable).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <ErrorFallback
          error={error}
          reset={reset}
          description="The app hit an unexpected error while loading. Please retry."
        />
      </body>
    </html>
  );
}
