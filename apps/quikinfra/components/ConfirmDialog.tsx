"use client";

/**
 * ConfirmDialog — centred modal for confirming destructive actions.
 *
 * Used instead of `window.confirm()` so the UX matches the rest of the app
 * (design-system buttons, backdrop, keyboard/click-outside dismissal).
 *
 * The component is presentational only — the caller decides what happens
 * on confirm (e.g. fire a delete mutation and wait on its promise). While
 * the promise is pending, pass `loading` so the confirm button shows a
 * spinner and the whole dialog is click-locked.
 */

import { useEffect, type ReactNode } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./PageShell";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" paints the confirm button red; "primary" uses the app accent. */
  tone?: "danger" | "primary";
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  loading = false,
}: ConfirmDialogProps) {
  // Lock body scroll while open, release on close or unmount
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Esc to cancel — only while open and not mid-confirm
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, loading, onClose]);

  if (!open) return null;

  const confirmBtnClass =
    tone === "danger"
      ? "bg-red-600 hover:bg-red-700 text-white disabled:bg-red-400"
      : "bg-orange-600 hover:bg-orange-700 text-white disabled:bg-orange-400";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop — clicking dismisses unless a confirm is in flight */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={loading ? undefined : onClose}
      />

      {/* Card */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-start gap-4 px-6 py-5 border-b border-gray-100">
          <div
            className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              tone === "danger" ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-600"
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <div className="text-sm text-gray-600 mt-1 leading-relaxed">{message}</div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="shrink-0 p-1 rounded-md text-gray-400 hover:bg-gray-100 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-gray-50">
          <SecondaryButton onClick={onClose} disabled={loading}>
            {cancelLabel}
          </SecondaryButton>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${confirmBtnClass}`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
