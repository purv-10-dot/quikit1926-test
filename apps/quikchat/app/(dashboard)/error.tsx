"use client";

/**
 * Error boundary for the whole authed (dashboard) group — the chat SPA (`/`),
 * `/settings/roles`, and any future authed surface.
 *
 * Catches render/hydration crashes that happen BEFORE a component's own
 * fetch/effect runs (an in-component try/catch can't reach those). Without this,
 * such a crash degrades to a silent frozen shell (e.g. the stale-`.next`-chunk
 * "Loading…" incident) instead of a visible, recoverable error.
 *
 * `reset()` is Next.js's standard segment re-render: it re-attempts the failed
 * subtree in place (no full reload), which recovers the transient/stale-chunk
 * case this boundary is meant to catch.
 */


import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the crash for debugging (the boundary otherwise swallows it).
    console.error("[quikchat] (dashboard) render error:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "var(--qc-bg)",
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
          background: "var(--qc-surface)",
          border: "1px solid var(--qc-surface-2)",
          borderRadius: "var(--qc-r-lg)",
          padding: "32px 28px",
        }}
      >
        <h1
          style={{
            margin: "0 0 8px",
            fontSize: 18,
            fontWeight: 700,
            color: "var(--qc-text)",
          }}
        >
          Something went wrong
        </h1>
        <p
          style={{
            margin: "0 0 24px",
            fontSize: 14,
            lineHeight: 1.5,
            color: "var(--qc-text-2)",
          }}
        >
          This page hit an unexpected error. Retrying usually clears a transient
          glitch; if it persists, reload the page.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: 40,
            padding: "0 22px",
            border: "none",
            borderRadius: "var(--qc-r-pill)",
            background: "var(--qc-accent)",
            color: "var(--qc-accent-fg)",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
