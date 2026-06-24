"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Button } from "@quikit/ui";
import { QT_CONFIRM_EVENT, type ConfirmRequest } from "@/lib/ui/confirm";

/**
 * Global confirmation dialog. Mount once in the dashboard layout. Any code can
 * await a confirmation via `confirmDialog({ message })` from `@/lib/ui/confirm`
 * — replaces the native `window.confirm`. Resolves false on cancel/dismiss.
 *
 * Rendered as a self-contained, screen-centered overlay (matching the app's
 * other modals like LogTimeModal/CopyWeekModal). The shared `@quikit/ui` Modal
 * mis-positioned this dialog low on the page, so we own the layout here.
 * TODO(integration): switch back to @quikit/ui Modal once its centering is fixed.
 */
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    function onConfirm(e: Event) {
      const detail = (e as CustomEvent<ConfirmRequest>).detail;
      if (detail?.message) setReq(detail);
    }
    window.addEventListener(QT_CONFIRM_EVENT, onConfirm);
    return () => window.removeEventListener(QT_CONFIRM_EVENT, onConfirm);
  }, []);

  useEffect(() => {
    if (!req) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") settle(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  function settle(ok: boolean) {
    req?.resolve(ok);
    setReq(null);
  }

  if (!req) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) settle(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3.5">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              req.danger
                ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400"
                : "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400"
            }`}
          >
            {req.danger ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <HelpCircle className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="text-base font-semibold text-gray-900">
              {req.title ?? "Are you sure?"}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600 whitespace-pre-line">
              {req.message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => settle(false)}>
            {req.cancelText ?? "Cancel"}
          </Button>
          <Button
            onClick={() => settle(true)}
            className={
              req.danger
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }
          >
            {req.confirmText ?? "Confirm"}
          </Button>
        </div>
      </div>
    </div>
  );
}
