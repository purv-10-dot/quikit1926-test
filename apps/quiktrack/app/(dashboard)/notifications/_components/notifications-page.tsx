"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCheck } from "lucide-react";
import { ITEM_LABEL, summarise, type NotificationRow } from "@/components/shell/notifications-meta";

type Tab = "direct" | "watching" | "all";

interface UnreadCounts {
  direct: number;
  watching: number;
  total: number;
}

const TABS: { value: Tab; label: string }[] = [
  { value: "direct", label: "Direct" },
  { value: "watching", label: "Watching" },
  { value: "all", label: "All" },
];

export function NotificationsPage() {
  const [tab, setTab] = useState<Tab>("direct");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState<UnreadCounts>({ direct: 0, watching: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const load = useCallback(
    async (which: Tab, unreadOnly: boolean, cursor: string | null) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ tab: which, limit: "50" });
        if (unreadOnly) params.set("unread", "1");
        if (cursor) params.set("cursor", cursor);
        const res = await fetch(`/api/notifications?${params.toString()}`).then((r) => r.json());
        if (res?.success) {
          setItems((prev) => (cursor ? [...prev, ...(res.data as NotificationRow[])] : (res.data as NotificationRow[])));
          setNextCursor(res.nextCursor ?? null);
          setUnread(res.unread as UnreadCounts);
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    void load(tab, onlyUnread, null);
  }, [tab, onlyUnread, load]);

  async function markAll() {
    await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true, ...(tab !== "all" ? { tab } : {}) }),
    });
    await load(tab, onlyUnread, null);
  }

  async function markOne(id: string) {
    await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
        <button
          type="button"
          onClick={markAll}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
        >
          <CheckCheck className="h-4 w-4" />
          Mark all as read
        </button>
      </div>

      <div className="flex items-center justify-between border-b border-gray-200 mb-3">
        <div className="flex items-center gap-6">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`relative pb-2 text-sm font-medium ${
                tab === t.value ? "text-accent-700" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {t.label}
              {t.value !== "all" && unread[t.value] > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-accent-100 text-accent-700 text-[10px] font-semibold">
                  {unread[t.value]}
                </span>
              )}
              {tab === t.value && <span className="absolute -bottom-px left-0 right-0 h-0.5 bg-accent-600 rounded" />}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600 select-none pb-2">
          Only show unread
          <input
            type="checkbox"
            checked={onlyUnread}
            onChange={(e) => setOnlyUnread(e.target.checked)}
            className="h-3.5 w-3.5 accent-accent-600"
          />
        </label>
      </div>

      <div className="bg-white border border-gray-200 rounded">
        {!loading && items.length === 0 && (
          <div className="p-10 text-center text-sm text-gray-500">
            No notifications.
          </div>
        )}
        {items.map((n) => (
          <Row key={n.id} item={n} onOpen={() => markOne(n.id)} />
        ))}
        {loading && <div className="p-4 text-center text-xs text-gray-400">Loading…</div>}
        {nextCursor && !loading && (
          <button
            type="button"
            onClick={() => void load(tab, onlyUnread, nextCursor)}
            className="w-full px-4 py-3 text-sm text-accent-700 hover:bg-gray-50 border-t border-gray-200"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ item, onOpen }: { item: NotificationRow; onOpen: () => void }) {
  const a = item.actor;
  const actorName = a ? `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || a.email : "Someone";
  const initials = a
    ? `${(a.firstName?.[0] || a.email?.[0] || "?").toUpperCase()}${(a.lastName?.[0] || "").toUpperCase()}`
    : "?";
  const summary = summarise(item);
  const issueHref = item.projectId
    ? `/spaces/${item.projectId}/board${item.issueId ? `?openIssue=${encodeURIComponent(item.issueId)}` : ""}`
    : "/notifications";
  return (
    <Link
      href={issueHref}
      onClick={onOpen}
      className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${
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
        {summary && <div className="text-sm text-gray-700 mt-0.5">{summary}</div>}
        <div className="text-[11px] text-gray-400 mt-1">{new Date(item.createdAt).toLocaleString()}</div>
      </div>
    </Link>
  );
}
