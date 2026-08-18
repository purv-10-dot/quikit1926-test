"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { APPROVER_STATUS_META, type ApproverStatus } from "./release-detail-meta";

const STATUS_ACTIONS: Record<ApproverStatus, { status: ApproverStatus; label: string }[]> = {
  PENDING: [
    { status: "APPROVED", label: "Approve" },
    { status: "DECLINED", label: "Decline" },
  ],
  APPROVED: [
    { status: "PENDING", label: "Revoke approval" },
    { status: "DECLINED", label: "Decline" },
  ],
  DECLINED: [{ status: "APPROVED", label: "Approve" }],
};

/**
 * Badge-as-dropdown-trigger for an approver's own status. Portalled to
 * document.body (same technique as PortalDropdown) so the menu is never
 * clipped by an ancestor `overflow-hidden` card — the approvers section's
 * outer container needs that overflow clip for its rounded corners, which
 * would otherwise cut the popover off for rows near the bottom of the list.
 */
export function ApproverStatusMenu({
  status,
  disabled,
  onPick,
}: {
  status: ApproverStatus;
  disabled: boolean;
  onPick: (status: ApproverStatus) => void;
}) {
  const meta = APPROVER_STATUS_META[status];
  const actions = STATUS_ACTIONS[status];
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ left: number; top: number } | null>(null);

  const measure = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.right, top: r.bottom + 4 });
  };

  useLayoutEffect(() => {
    if (open) measure();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScrollOrResize = () => measure();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium disabled:cursor-default ${meta.className} ${
          !disabled ? "hover:brightness-95" : ""
        }`}
      >
        {meta.label}
        {!disabled && <ChevronDown className="h-3 w-3" />}
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: "fixed", left: rect.left, top: rect.top, transform: "translateX(-100%)", zIndex: 60 }}
            className="min-w-[160px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          >
            {actions.map((opt) => (
              <button
                key={opt.status}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(opt.status);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                {opt.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
