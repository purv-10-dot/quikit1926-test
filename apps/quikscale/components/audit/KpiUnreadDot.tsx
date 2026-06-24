"use client";

import { useModuleUnread } from "@/lib/hooks/useKPI";

/**
 * Small red dot shown on the KPI sidebar nav when the current user has any
 * unread KPI audit events. Refetches on window focus (AC-1.33).
 */
export function KpiUnreadDot() {
  const { data: unread = 0 } = useModuleUnread("KPI");
  if (!unread) return null;
  return (
    <span
      className="ml-auto h-2 w-2 shrink-0 rounded-full bg-red-500"
      aria-label={`${unread} unread KPI updates`}
      title={`${unread} unread KPI updates`}
    />
  );
}
