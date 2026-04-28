"use client";

/**
 * Notification bell — fixed-position floating button + dropdown panel.
 *
 * Polls /api/notifications every 30s for unread count + recent items.
 * Mark-all-read on open; click an item to navigate via item.href.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const r = await fetch("/api/notifications?limit=15");
      const j = await r.json();
      if (j.success) {
        setItems(j.data.items);
        setUnreadCount(j.data.unreadCount);
      }
    } catch {
      // ignore
    }
  }

  async function markAllRead() {
    await fetch("/api/notifications/mark-read", { method: "POST" });
    setUnreadCount(0);
    setItems((curr) => curr.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })));
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next && unreadCount > 0) markAllRead();
        }}
        className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-semibold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-[480px] flex flex-col">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Notifications</p>
            <Link href="/notifications" className="text-xs text-gray-500 hover:text-gray-900">
              View all →
            </Link>
          </div>
          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-xs text-gray-400 text-center">No notifications yet.</p>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id} className="border-b border-gray-100 last:border-b-0">
                    <Link
                      href={n.href ?? "#"}
                      onClick={() => setOpen(false)}
                      className={`block px-4 py-3 hover:bg-gray-50 ${!n.readAt ? "bg-blue-50/40" : ""}`}
                    >
                      <p className="text-xs font-medium text-gray-900 leading-snug">{n.title}</p>
                      {n.body && <p className="text-[11px] text-gray-600 mt-0.5 leading-snug">{n.body}</p>}
                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(n.createdAt).toLocaleString("en-GB", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
