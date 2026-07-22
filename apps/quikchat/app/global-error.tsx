"use client";

import "./globals.css";

/**
 * Root error boundary — the last line of defence: it catches errors thrown by
 * the root layout itself, so it must render its own <html>/<body> (the root
 * layout is exactly what failed and is unavailable).
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>QuikChat failed to load</h1>
          <p style={{ maxWidth: 360, fontSize: 14, opacity: 0.7 }}>
            The app hit an unexpected error while loading. Please retry.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              color: "#fff",
              background: "#0066cc",
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
