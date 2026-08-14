"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ExternalLink, MoreHorizontal, CheckCheck } from "lucide-react";
import type { NotificationRow } from "./notifications-meta";
import { NotificationItem } from "./notification-item";

type Tab = "direct" | "watching";

interface UnreadCounts {
  direct: number;
  watching: number;
  total: number;
}

const POLL_MS = 15_000;

export function NotificationsPopover() {
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("direct");
  const [unread, setUnread] = useState<UnreadCounts>({ direct: 0, watching: 0, total: 0 });
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count").then((r) => r.json());
      if (res?.success) setUnread(res.data as UnreadCounts);
    } catch {
      // best-effort badge
    }
  }, []);

  useEffect(() => {
    void refreshUnread();
    const id = setInterval(() => void refreshUnread(), POLL_MS);
    return () => clearInterval(id);
  }, [refreshUnread]);

  const loadList = useCallback(async (which: Tab, unreadOnly: boolean) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ tab: which, limit: "30" });
      if (unreadOnly) params.set("unread", "1");
      const res = await fetch(`/api/notifications?${params.toString()}`).then((r) => r.json());
      if (res?.success) {
        setItems(res.data as NotificationRow[]);
        setUnread(res.unread as UnreadCounts);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadList(tab, onlyUnread);
    const id = setInterval(() => void loadList(tab, onlyUnread), POLL_MS);
    return () => clearInterval(id);
  }, [open, tab, onlyUnread, loadList]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (popRef.current?.contains(t)) return;
      if (btnRef.current?.contains(t)) return;
      setOpen(false);
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAllRead() {
    try {
      const res = await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true, tab }),
      }).then((r) => r.json());
      if (res?.success) {
        await loadList(tab, onlyUnread);
        await refreshUnread();
      }
    } catch {
      // ignore
    }
    setMenuOpen(false);
  }

  async function markOne(id: string) {
    try {
      await fetch("/api/notifications/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
      void refreshUnread();
    } catch {
      // ignore
    }
  }

  const badge = unread.total;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative p-2 rounded text-gray-600 ${open ? "bg-gray-100" : "hover:bg-gray-100"}`}
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {badge > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-4 text-center">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={popRef}
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-[420px] bg-white rounded-lg shadow-2xl border border-gray-200 z-50 max-h-[78vh] flex flex-col"
        >
          <div className="px-4 pt-3 pb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Notifications</h2>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-gray-600 select-none">
                Only show unread
                <span
                  role="switch"
                  aria-checked={onlyUnread}
                  tabIndex={0}
                  onClick={() => setOnlyUnread((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      setOnlyUnread((v) => !v);
                    }
                  }}
                  className={`relative inline-block w-8 h-4 rounded-full transition-colors cursor-pointer ${
                    onlyUnread ? "bg-accent-600" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
                      onlyUnread ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </span>
              </label>
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-gray-100 text-gray-500"
                aria-label="Open notifications page"
              >
                <ExternalLink className="h-4 w-4" />
              </Link>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="p-1 rounded hover:bg-gray-100 text-gray-500"
                  aria-label="More options"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-1 w-44 bg-white rounded shadow-lg border border-gray-200 py-1 z-10">
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                    >
                      <CheckCheck className="h-4 w-4" />
                      Mark all as read
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="px-4 border-b border-gray-200 flex items-center gap-4">
            {(["direct", "watching"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`relative pb-2 text-sm font-medium ${
                  tab === t ? "text-accent-700" : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {t === "direct" ? "Direct" : "Watching"}
                {unread[t] > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent-100 text-accent-700 text-[10px] font-semibold">
                    {unread[t]}
                  </span>
                )}
                {tab === t && <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-accent-600 rounded" />}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="px-4 py-10 text-center text-xs text-gray-400">Loading…</div>
            )}
            {!loading && items.length === 0 && (
              <div className="px-4 py-12 text-center text-sm text-gray-500">
                You have no notifications from the last 30 days.
              </div>
            )}
            {!loading &&
              items.map((n) => (
                <NotificationItem key={n.id} item={n} onOpen={() => markOne(n.id)} closePopover={() => setOpen(false)} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

