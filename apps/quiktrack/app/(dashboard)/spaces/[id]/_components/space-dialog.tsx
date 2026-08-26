"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Portal-mounted, flex-centred dialog shell shared by the "..." menu's dialogs
 * (Linked teams / Save as template / Set space background / Delete space).
 *
 * Same rationale as `components/confirm-dialog.tsx`: the shared @quikit/ui
 * <Modal> centres with a Tailwind `-translate-x/y-1/2` transform that
 * framer-motion's inline `transform` overrides at runtime, leaving the dialog
 * off-centre. Flex centring on a full-viewport backdrop is transform-independent.
 * TODO(integration): drop this once @quikit/ui <Modal> centres reliably.
 */
export function SpaceDialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  widthClass = "max-w-lg",
  busy = false,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
  /** While true, Esc / backdrop clicks are ignored so a request can finish. */
  busy?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Stop the key here: the project header listens for Escape to leave
      // fullscreen, and closing a dialog shouldn't also exit fullscreen.
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, busy, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`flex w-full ${widthClass} max-h-[85vh] flex-col rounded-xl bg-white shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            {description && (
              <p className="mt-1 text-sm leading-snug text-gray-600">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
