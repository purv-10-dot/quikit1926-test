"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  /** Sticky action bar (Cancel / Save) pinned below scrollable body. */
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={
          "flex max-h-[92vh] w-full flex-col bg-white shadow-crm-modal " +
          "rounded-t-2xl sm:max-h-[85vh] sm:rounded-xl sm:border sm:border-crm-border " +
          width
        }
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-crm-border px-4 py-3 sm:px-5">
            <h2 className="truncate pr-4 text-base font-semibold text-crm-text">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="crm-btn-ghost h-8 w-8 shrink-0 p-0"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-auto p-4 sm:p-5">{children}</div>
          {footer ? (
            <div className="shrink-0 border-t border-crm-border bg-white px-4 py-3 sm:px-5">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
