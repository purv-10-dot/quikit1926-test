"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Sticky footer rendered below the scrollable body. */
  footer?: ReactNode;
  /** Tailwind max-width class applied at `md+`. Defaults to `md:max-w-xl`.
   * On `<md` the drawer is always full-width to avoid wasted real-estate. */
  width?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md:max-w-xl",
}: DrawerProps) {
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
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-slate-900/40" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex h-full w-full flex-col bg-white shadow-crm-modal ${width}`}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-crm-border px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-crm-text sm:text-lg">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-crm-muted">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded p-1 text-crm-muted hover:bg-crm-panel hover:text-crm-text"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
        {footer && (
          <footer className="shrink-0 border-t border-crm-border px-4 py-3 sm:px-6">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}
