"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ExternalLink, MoreHorizontal, CheckCheck, ListChecks } from "lucide-react";
import { ITEM_LABEL, summarise, type NotificationRow } from "./notifications-meta";

type Tab = "direct" | "watching";

interface UnreadCounts {
  direct: number;
  watching: number;
  total: number;
}

const POLL_MS = 60_000;

export function NotificationsPopover() {
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [tab] = useState<Tab>("direct");
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
    if (open) void loadList(tab, onlyUnread);
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
            <button
              type="button"
              className="relative pb-2 text-sm font-medium text-accent-700"
            >
              Direct
              {unread.direct > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent-100 text-accent-700 text-[10px] font-semibold">
                  {unread.direct}
                </span>
              )}
              <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-accent-600 rounded" />
            </button>
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

function NotificationItem({
  item,
  onOpen,
  closePopover,
}: {
  item: NotificationRow;
  onOpen: () => void;
  closePopover: () => void;
}) {
  const a = item.actor;
  const initials = a
    ? `${(a.firstName?.[0] || a.email?.[0] || "?").toUpperCase()}${(a.lastName?.[0] || "").toUpperCase()}`
    : "?";
  const actorName = a ? `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || a.email : "Someone";
  const summary = summarise(item);
  const onClick = () => {
    onOpen();
    closePopover();
  };

  // Personal checklist reminder — no actor/issue, so render its own clean row
  // (icon + "Checklist reminder" + the due-item snippet) instead of the
  // issue-shaped "[actor] updated [KEY]" layout.
  if (item.type === "checklist_due") {
    return (
      <Link
        href="/dashboard"
        onClick={onClick}
        className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
          item.isRead ? "" : "bg-accent-50/40"
        }`}
      >
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <ListChecks className="h-4 w-4" />
          {!item.isRead && (
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-white" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-gray-900">Checklist reminder</div>
          {summary && <div className="text-sm text-gray-700 line-clamp-2 mt-0.5">{summary}</div>}
          <div className="text-[11px] text-gray-400 mt-1">{relTime(item.createdAt)}</div>
        </div>
      </Link>
    );
  }

  const issueHref = item.projectId
    ? `/spaces/${item.projectId}/board${item.issueId ? `?openIssue=${encodeURIComponent(item.issueId)}` : ""}`
    : "/notifications";
  return (
    <Link
      href={issueHref}
      onClick={onClick}
      className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
        item.isRead ? "" : "bg-accent-50/40"
      }`}
    >
      <div className="relative h-8 w-8 shrink-0 rounded-full bg-accent-600 text-white text-xs font-semibold flex items-center justify-center">
        {initials}
        {!item.isRead && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-white" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-gray-500">
          <span className="font-medium text-gray-900">{actorName}</span> {ITEM_LABEL[item.type] ?? "updated"}{" "}
          {item.issueKey && <span className="font-medium text-accent-700">{item.issueKey}</span>}
        </div>
        {summary && <div className="text-sm text-gray-700 line-clamp-2 mt-0.5">{summary}</div>}
        <div className="text-[11px] text-gray-400 mt-1">{relTime(item.createdAt)}</div>
      </div>
    </Link>
  );
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
