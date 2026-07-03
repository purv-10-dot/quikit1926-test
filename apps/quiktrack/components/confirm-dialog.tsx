"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@quikit/ui";
import { AlertTriangle, HelpCircle } from "lucide-react";

/**
 * Small controlled yes/no confirmation dialog for consequential project
 * lifecycle actions (archive, move to trash, restore).
 *
 * Rendered as a portal-mounted, flex-centered overlay rather than the shared
 * @quikit/ui <Modal>: that component centres via a Tailwind
 * `-translate-x/y-1/2` transform, which framer-motion's inline `transform`
 * overrides at runtime, leaving the dialog visibly off-centre. Flex centring on
 * a full-viewport backdrop is transform-independent and always centred.
 * TODO(integration): drop this once @quikit/ui <Modal> centres reliably.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc cancels (unless a request is in flight).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  if (!mounted || !open) return null;

  const danger = tone === "danger";
  const Icon = danger ? AlertTriangle : HelpCircle;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      onClick={() => !loading && onCancel()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
                danger ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
              }`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>

          {message && (
            <p className="mt-3 text-sm leading-relaxed text-gray-600">{message}</p>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" size="md" onClick={onCancel} disabled={loading}>
              {cancelLabel}
            </Button>
            <Button
              variant={danger ? "danger" : "primary"}
              size="md"
              onClick={onConfirm}
              loading={loading}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
