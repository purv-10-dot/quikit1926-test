"use client";

/**
 * Last-resort boundary for errors thrown by the ROOT layout itself.
 *
 * It replaces the entire document, so it must render its own <html>/<body> —
 * no provider, no globals.css, hence the inline styles. Anything that throws
 * below the root layout is caught by app/(dashboard)/error.tsx instead.
 *
 * quiktrack and quiklms ship one of these; this app previously did not, so a
 * root-layout failure showed Next's raw error page.
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
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          color: "#0b1220",
          background: "#f8fafc",
        }}
      >
        <div style={{ maxWidth: "32rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem", fontWeight: 600 }}>
            QuikCRMExpress hit an unexpected error
          </h1>
          <p style={{ color: "#475569", lineHeight: 1.6, margin: "0 0 1.5rem" }}>
            The page could not be rendered. Trying again often clears it; if it
            persists, quote the reference below to support.
          </p>
          {error.digest ? (
            <p
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.8125rem",
                color: "#94a3b8",
                margin: "0 0 1.5rem",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#2563eb",
              color: "#fff",
              border: 0,
              padding: "0.7rem 1.25rem",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: "0.9375rem",
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
