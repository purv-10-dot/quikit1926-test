import * as React from "react";
import { X } from "./icons";
import { IconButton } from "./IconButton";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Faux-viewport modal: an overlay positioned `absolute; inset: 0` inside the
 * `.qc-frame` (which is sized to the viewport and `position: relative`). No
 * `position: fixed`. Click-outside + Escape close it.
 */
export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    cardRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="qc-modal-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="qc-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={cardRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="qc-modal-head">
          <span className="qc-modal-title">{title}</span>
          <IconButton label="Close" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="qc-modal-body">{children}</div>
        {footer ? <div className="qc-modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
