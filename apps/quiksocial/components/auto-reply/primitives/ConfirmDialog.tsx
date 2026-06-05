"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Minimal confirmation dialog rendered into a body-level portal.
 * Glass overlay + heavy-glass dialog body matching the v2 modal pattern.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    requestAnimationFrame(() => confirmRef.current?.focus());
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel, onConfirm]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(0, 0, 0, 0.60)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        style={{
          background: "rgba(33, 33, 33, 0.12)",
          border: "1px solid rgba(255, 255, 255, 0.18)",
          borderRadius: 24,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.25)",
          padding: 28,
          width: "100%",
          maxWidth: 420,
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            color: "#FFFFFF",
          }}
        >
          {title}
        </h3>
        {description && (
          <p
            style={{
              marginTop: 10,
              marginBottom: 0,
              fontSize: 13,
              lineHeight: 1.5,
              color: "rgba(255, 255, 255, 0.65)",
            }}
          >
            {description}
          </p>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 20,
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "1px solid rgba(255, 255, 255, 0.10)",
              background: "rgba(255, 255, 255, 0.10)",
              color: "#FFFFFF",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            style={{
              padding: "8px 16px",
              borderRadius: 10,
              border: "none",
              background: danger ? "#EF4444" : "#FFFFFF",
              color: danger ? "#FFFFFF" : "#0A0A0A",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
