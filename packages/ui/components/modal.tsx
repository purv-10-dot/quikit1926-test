"use client";

import { useEffect, useRef, useCallback } from "react";
import { cn } from "../lib/utils";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      // Focus trap
      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (open) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleKeyDown);

      // Focus the modal on open
      requestAnimationFrame(() => {
        modalRef.current?.focus();
      });
    } else {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);

      // Restore focus to previous element
      previousActiveElement.current?.focus();
    }
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  const titleId = title ? "modal-title" : undefined;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50 z-modal-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative z-modal w-full max-w-lg rounded-xl bg-[var(--color-bg-primary)] p-6 shadow-xl outline-none",
          className
        )}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h2
              id={titleId}
              className="text-lg font-semibold text-[var(--color-text-primary)]"
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1 text-[var(--color-text-tertiary)] hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
