"use client";

import { Bell, CheckCheck } from "lucide-react";
import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
} from "@/hooks/use-notifications";
import { NotificationItem } from "./notification-item";

interface Props {
  onClose: () => void;
}

export function NotificationCenter({ onClose }: Props) {
  const { data, isLoading } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className={[
        // Dropdown positioning — sits below the bell button
        "absolute right-0 top-full z-50 mt-2",
        // Size
        "w-[min(384px,calc(100vw-1rem))]",
        "flex max-h-[520px] flex-col",
        // Visual
        "overflow-hidden rounded-2xl border border-slate-200 bg-white",
        "shadow-[0_8px_40px_rgba(15,23,42,0.14),0_2px_8px_rgba(15,23,42,0.06)]",
        // Entrance animation
        "animate-in fade-in-0 zoom-in-95 duration-150 ease-out",
        "origin-top-right",
      ].join(" ")}
    >
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[13px] font-semibold text-slate-900">
            Notifications
          </h2>
          {unread > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-blue-600 px-1.5 text-[9px] font-bold text-white">
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
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5",
              "text-[11px] font-medium text-slate-500",
              "transition-colors hover:bg-slate-100 hover:text-slate-700",
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
          <div>
            {items.map((n, i) => (
              <NotificationItem
                key={n.id}
                notification={n}
                isLast={i === items.length - 1}
                onMarkRead={(id) => {
                  markRead.mutate(id);
                }}
                onClose={onClose}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      {items.length > 0 && (
        <div className="shrink-0 border-t border-slate-100 px-4 py-2.5">
          <p className="text-center text-[11px] text-slate-400">
            {unread === 0
              ? "You're all caught up ✓"
              : `${unread} unread · ${items.length} shown`}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <div aria-busy aria-label="Loading notifications">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 border-b border-slate-100 py-3.5 pl-5 pr-4 last:border-0"
        >
          {/* Avatar placeholder */}
          <div className="mt-0.5 h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-100" />

          {/* Text placeholders */}
          <div className="flex-1 space-y-2 py-0.5">
            <div className="flex items-center justify-between gap-4">
              <div
                className="h-3 animate-pulse rounded-full bg-slate-200"
                style={{ width: `${55 + (i % 3) * 15}%` }}
              />
              <div className="h-2.5 w-10 animate-pulse rounded-full bg-slate-100" />
            </div>
            <div className="h-2.5 w-full animate-pulse rounded-full bg-slate-100" />
            <div
              className="h-2.5 animate-pulse rounded-full bg-slate-100"
              style={{ width: `${40 + (i % 2) * 20}%` }}
            />
            <div className="h-5 w-20 animate-pulse rounded-full bg-slate-100" />
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
      {/* Illustration */}
      <div className="relative">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 shadow-inner">
          <Bell size={28} className="text-slate-300" strokeWidth={1.5} />
        </div>
        {/* Decorative dots */}
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-slate-200" />
        <span className="absolute -bottom-0.5 -left-1 h-2 w-2 rounded-full bg-slate-150" />
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-slate-700">All caught up</p>
        <p className="max-w-[220px] text-[12px] leading-relaxed text-slate-400">
          Notifications for lead assignments, stage changes, and conversions will appear here.
        </p>
      </div>
    </div>
  );
}
