"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Inline error banner styled to read on the dark glass surfaces used
 * across the dashboard. Tinted red glass instead of the solid pastel
 * from the prototype.
 */
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 12,
        background: "rgba(239, 68, 68, 0.10)",
        border: "1px solid rgba(239, 68, 68, 0.32)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        color: "#FFFFFF",
        marginBottom: 14,
        fontSize: 13,
      }}
    >
      <AlertTriangle size={16} color="#F87171" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12,
            fontWeight: 500,
            background: "rgba(255, 255, 255, 0.10)",
            color: "#FFFFFF",
            border: "1px solid rgba(255, 255, 255, 0.18)",
            borderRadius: 8,
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          <RefreshCw size={12} />
          Retry
        </button>
      )}
    </div>
  );
}
