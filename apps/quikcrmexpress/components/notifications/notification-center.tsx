"use client";

import { useEffect, useMemo, useRef } from "react";
import { Bell, CheckCheck } from "lucide-react";
import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
} from "@/hooks/use-notifications";
import type { NotificationRow } from "@/lib/notifications/types";
import { NotificationItem } from "./notification-item";

interface Props {
  onClose: () => void;
}

/** Split items into Today / Earlier by the start of the local day. */
export function groupByDay(items: NotificationRow[]): {
  today: NotificationRow[];
  earlier: NotificationRow[];
} {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const cutoff = startOfToday.getTime();

  const today: NotificationRow[] = [];
  const earlier: NotificationRow[] = [];
  for (const n of items) {
    const t = new Date(n.createdAt).getTime();
    if (t >= cutoff) today.push(n);
    else earlier.push(n);
  }
  return { today, earlier };
}

export function NotificationCenter({ onClose }: Props) {
  const { data, isLoading } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const unread = data?.unread ?? 0;

  const { today, earlier } = useMemo(() => groupByDay(items), [items]);

  // ── New-item entrance ──
  // Track ids we've already rendered; any id not yet seen is "new" and gets a
  // subtle slide/fade entrance. Realtime-prepended notifications animate in.
  const seenRef = useRef<Set<string>>(new Set());
  const isNew = (id: string) => !seenRef.current.has(id);

  useEffect(() => {
    for (const n of items) seenRef.current.add(n.id);
  }, [items]);

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className={[
        "absolute right-0 top-full z-50 mt-2",
        "w-[min(384px,calc(100vw-1rem))]",
        "flex max-h-[520px] flex-col",
        "overflow-hidden rounded-xl border border-crm-border bg-crm-surface",
        "shadow-crm-dropdown",
        "animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150 ease-out",
        "origin-top-right",
      ].join(" ")}
    >
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-crm-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-crm-text">
            Notifications
          </h2>
          {unread > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent-50 px-1.5 text-[10px] font-semibold text-accent-700">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>

        {unread > 0 && (
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className={[
              "flex items-center gap-1.5 rounded-lg px-2 py-1",
              "text-[11px] font-medium text-crm-muted",
              "transition-colors hover:bg-crm-panel hover:text-crm-text",
              "disabled:pointer-events-none disabled:opacity-40",
            ].join(" ")}
          >
            <CheckCheck size={12} strokeWidth={2.5} />
            Mark all read
          </button>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {isLoading ? (
          <SkeletonList />
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <Group
              label="Today"
              items={today}
              isNew={isNew}
              onMarkRead={(id) => markRead.mutate(id)}
              onClose={onClose}
            />
            <Group
              label="Earlier"
              items={earlier}
              isNew={isNew}
              onMarkRead={(id) => markRead.mutate(id)}
              onClose={onClose}
            />
          </>
        )}
      </div>

      {/* ── Footer ── */}
      {items.length > 0 && (
        <div className="shrink-0 border-t border-crm-border px-4 py-2.5">
          <p className="text-center text-[11px] text-crm-muted">
            {unread === 0
              ? "You're all caught up"
              : `${unread} unread · ${items.length} shown`}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Grouped section ──────────────────────────────────────────────────────────

function Group({
  label,
  items,
  isNew,
  onMarkRead,
  onClose,
}: {
  label: string;
  items: NotificationRow[];
  isNew: (id: string) => boolean;
  onMarkRead: (id: string) => void;
  onClose: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-crm-muted">
        {label}
      </h3>
      <div>
        {items.map((n, i) => (
          <div
            key={n.id}
            className={
              isNew(n.id)
                ? "animate-in fade-in-0 slide-in-from-top-2 duration-300"
                : undefined
            }
          >
            <NotificationItem
              notification={n}
              isLast={i === items.length - 1}
              onMarkRead={onMarkRead}
              onClose={onClose}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <div aria-busy aria-label="Loading notifications">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 border-b border-crm-border px-4 py-3 last:border-0"
        >
          <div className="mt-0.5 h-9 w-9 shrink-0 animate-pulse rounded-full bg-crm-panel" />
          <div className="flex-1 space-y-2 py-0.5">
            <div className="flex items-center justify-between gap-4">
              <div
                className="h-3 animate-pulse rounded-full bg-crm-border"
                style={{ width: `${55 + (i % 3) * 15}%` }}
              />
              <div className="h-2.5 w-8 animate-pulse rounded-full bg-crm-panel" />
            </div>
            <div
              className="h-2.5 animate-pulse rounded-full bg-crm-panel"
              style={{ width: `${40 + (i % 2) * 20}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-crm-panel">
        <Bell size={24} className="text-crm-muted" strokeWidth={1.5} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-crm-text">All caught up</p>
        <p className="max-w-[220px] text-[12px] leading-relaxed text-crm-muted">
          Notifications for lead assignments, tasks, and stage changes will
          appear here.
        </p>
      </div>
    </div>
  );
}
