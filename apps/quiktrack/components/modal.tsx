"use client";

// TODO(integration): upstream to @quikit/ui — packages/ui/components/modal.tsx
// has a centering bug: its single motion.div carries BOTH the
// `-translate-x-1/2 -translate-y-1/2` centering classes AND a Framer Motion
// `animate={{ scale: 1 }}`. Framer Motion writes the CSS `transform`
// property directly as an inline style to animate `scale`, which permanently
// overrides the Tailwind transform classes on that same element (inline
// styles always beat stylesheet rules, regardless of specificity) — so the
// modal's translate(-50%,-50%) recentering never applies and it renders with
// its top-left corner at viewport center instead of being centered. This
// local copy fixes it by splitting the concern across two elements: a plain
// (non-animated) div does the fixed/centering positioning, and only an INNER
// motion.div carries the scale/opacity animation — so Framer's inline
// transform never touches the element that needs the translate.
import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@quikit/ui";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export const Modal = ({ open, onOpenChange, children, className }: ModalProps) => {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [open]);

  // Portal to <body>: without it, the backdrop's `fixed inset-0` is measured
  // against the nearest transformed/filtered ancestor (the dashboard shell) and
  // stops short of the top nav — leaving the header un-dimmed. Portaling makes
  // `fixed` relative to the real viewport so the overlay covers the whole screen.
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-modal-backdrop bg-black bg-opacity-50 dark:bg-opacity-60"
          onClick={() => onOpenChange(false)}
        >
          <div
            className={cn(
              "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
              "z-modal w-full max-w-md mx-auto",
              className,
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};

export {
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalBody,
  ModalFooter,
} from "@quikit/ui";
