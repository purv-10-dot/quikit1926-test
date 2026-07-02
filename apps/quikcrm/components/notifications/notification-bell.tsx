"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useUnreadCount } from "@/hooks/use-notifications";
import { NotificationCenter } from "./notification-center";

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { data } = useUnreadCount();
  const unread = data?.count ?? 0;

  // Badge is kept up to date by useUnreadCount()'s 60s poll (see use-notifications.ts).

  // Close when clicking anywhere outside the wrapper (bell + dropdown).
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape key.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    // Single relative container — bell + dropdown share the same coordinate root.
    // This fixes the previous z-index bug where the backdrop covered the bell.
    <div className="relative" ref={wrapperRef}>
      {/* ── Bell button ── */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "relative flex h-9 w-9 items-center justify-center rounded-lg",
          "transition-colors focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-crm-blue-glow",
          open
            ? "bg-slate-100 text-slate-700"
            : "text-crm-muted hover:bg-crm-panel hover:text-crm-text",
        ].join(" ")}
        aria-label={
          unread > 0
            ? `${unread} unread notification${unread !== 1 ? "s" : ""}`
            : "Notifications"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell size={18} />

        {/* Unread count badge */}
        {unread > 0 && (
          <span
            aria-hidden
            className={[
              "absolute -right-1 -top-1",
              "flex h-[18px] min-w-[18px] items-center justify-center",
              "rounded-full bg-red-500 px-1",
              "text-[9px] font-bold leading-none text-white",
              "shadow-sm ring-2 ring-white",
              "animate-in zoom-in-75 duration-150",
            ].join(" ")}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ── */}
      {open && <NotificationCenter onClose={() => setOpen(false)} />}
    </div>
  );
}
