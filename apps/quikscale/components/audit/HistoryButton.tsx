"use client";

import { Clock } from "lucide-react";
import { useUnreadCount } from "@/lib/hooks/useKPI";
import { useHasUnreadCountsProvider, useUnreadCountFromContext } from "./UnreadCountsProvider";

/**
 * "History logs" trigger with a per-user unread badge (AC-1.1/1.2/1.3).
 * Renders the unread count (capped "99+") as a red badge. Used on the KPI row,
 * the edit-drawer header, the dashboard card, and the Teams grid (via the row).
 */
export function HistoryButton({
  entityId,
  onClick,
  disabled = false,
  variant = "icon",
  label = "History logs",
  className = "",
}: {
  entityId: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "icon" | "full";
  label?: string;
  className?: string;
}) {
  // Prefer the page-level batched provider (one request for all rows). Only
  // fall back to a per-entity fetch when no provider is mounted.
  const hasProvider = useHasUnreadCountsProvider();
  const ctxCount = useUnreadCountFromContext(entityId);
  const { data: singleCount = 0 } = useUnreadCount(entityId, !disabled && !hasProvider);
  const unread = hasProvider ? (ctxCount ?? 0) : singleCount;
  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Read-only" : label}
      aria-label={unread > 0 ? `${label} (${unread} unread)` : label}
      className={
        variant === "full"
          ? `relative inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 ${className}`
          : `relative rounded p-1 transition-colors ${disabled ? "cursor-not-allowed text-gray-300" : "text-gray-400 hover:bg-gray-100 hover:text-blue-500"} ${className}`
      }
    >
      <Clock className="h-3.5 w-3.5" />
      {variant === "full" && <span>{label}</span>}
      {unread > 0 && (
        <span
          data-testid="unread-badge"
          className="absolute -right-1.5 -top-1.5 inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white"
        >
          {badge}
        </span>
      )}
    </button>
  );
}
