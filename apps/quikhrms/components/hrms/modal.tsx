"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { clsx } from "clsx";

type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  headerIcon?: React.ReactNode;
  children: React.ReactNode;
  size?: ModalSize;
  bodyClassName?: string;
  /** Override the size preset with an explicit max-width utility (e.g. "max-w-[960px]"). */
  maxWidthClass?: string;
  /** Override the default max-h-[92vh] (e.g. "max-h-[80vh]"). */
  maxHeightClass?: string;
}

const sizeClass: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
  "2xl": "max-w-4xl",
  "3xl": "max-w-5xl",
};

const EXIT_MS = 160;

/**
 * Animated, fully controlled modal: `<Modal open={state} onClose={() => setState(false)} />`.
 *
 * Close (X / backdrop / Escape) calls `onClose` immediately, which flips `open`
 * to false; the exit animation then plays internally before the modal unmounts.
 * Reopening while it's animating out cancels the unmount cleanly — so a fast
 * close→reopen never leaves a stuck invisible overlay (freeze) or flickers shut.
 */
export function Modal({ open, onClose, title, subtitle, headerIcon, children, size = "md", bodyClassName = "p-4 overflow-y-auto", maxWidthClass, maxHeightClass }: ModalProps) {
  // `render` keeps the modal mounted through its exit animation; `closing`
  // selects the in/out animation classes. Both are driven by the `open` prop.
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      // (Re)open — show immediately and cancel any in-flight exit.
      setRender(true);
      setClosing(false);
      return;
    }
    // Closed — play the exit animation, then unmount. If `open` flips back to
    // true mid-exit, this effect re-runs and its cleanup clears the timer.
    setClosing(true);
    const t = setTimeout(() => {
      setRender(false);
      setClosing(false);
    }, EXIT_MS);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!render) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [render, onClose]);

  if (!render) return null;
  // Portal to <body> so the overlay escapes any parent stacking context
  // (e.g. a `relative z-10` page wrapper) and always covers the sticky top bar.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className={clsx(
          "fixed inset-0 bg-black/50",
          closing ? "modal-backdrop-out" : "modal-backdrop-in",
        )}
        onClick={onClose}
      />
      <div
        className={clsx(
          "relative bg-white rounded-2xl shadow-xl w-full mx-4 overflow-hidden flex flex-col",
          maxHeightClass ?? "max-h-[92vh]",
          maxWidthClass ?? sizeClass[size],
          closing ? "modal-panel-out" : "modal-panel-in",
        )}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-100">
          <div className="flex items-start gap-2.5">
            {headerIcon && (
              <div className="w-7 h-7 rounded-lg bg-[#166534]/5 text-[#166534] flex items-center justify-center shrink-0">
                {headerIcon}
              </div>
            )}
            <div>
              <h2 className="text-body font-semibold text-gray-900">{title}</h2>
              {subtitle && <p className="text-caption text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className={`flex-1 min-h-0 ${bodyClassName}`}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
