"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Dropdown({
  trigger,
  children,
  align = "right",
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }

    function position() {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: r.bottom + 8,
        left: align === "right" ? r.right : r.left,
      });
    }

    function close() {
      setOpen(false);
    }

    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, align]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={triggerRef} className="relative inline-block shrink-0">
      <div
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </div>
      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              transform: align === "right" ? "translateX(-100%)" : undefined,
              zIndex: 50,
            }}
            className="min-w-[10rem] rounded-lg border border-crm-border bg-white shadow-crm-dropdown"
            onClick={() => setOpen(false)}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function DropdownItem({
  onSelect,
  children,
  danger,
  disabled,
}: {
  onSelect?: () => void;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={
        "block w-full px-4 py-2 text-left text-sm " +
        (disabled
          ? "cursor-not-allowed text-crm-muted opacity-60"
          : "hover:bg-crm-panel " + (danger ? "text-red-600" : "text-crm-text"))
      }
    >
      {children}
    </button>
  );
}
