"use client";

/**
 * Notification hooks.
 *
 * Two concerns:
 *   1. useNotifications() — paginated list with React Query (cache + re-fetch).
 *   2. useUnreadCount()   — lightweight badge count, polled every 60s.
 *
 * Delivery is poll-based: the badge refetches on an interval and the list
 * refetches on window focus + after mutations. (Realtime SSE/Redis delivery
 * was removed.)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NotificationRow } from "@/lib/notifications/types";

// ─── Query keys ───────────────────────────────────────────────────────────────

const NOTIFICATIONS_KEY = ["notifications"] as const;
const UNREAD_COUNT_KEY = ["notifications", "unread-count"] as const;

// ─── API response types ───────────────────────────────────────────────────────

export interface NotificationPage {
  items: NotificationRow[];
  unread: number;
  hasMore: boolean;
  nextCursor: string | null;
}

// ─── List hook ────────────────────────────────────────────────────────────────

/** Fetch the first page of notifications. Invalidated by SSE + mutations. */
export function useNotifications() {
  return useQuery<NotificationPage>({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/notifications?take=30");
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

// ─── Unread count hook ────────────────────────────────────────────────────────

/** Fast badge count. Polled every 60s to pick up new notifications. */
export function useUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread-count");
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    staleTime: 10_000,
    refetchInterval: 60_000,
  });
}

// ─── Mark-as-read mutations ───────────────────────────────────────────────────

/** Mark a single notification as read. */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      qc.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
    },
  });
}

/** Mark every unread notification as read. */
export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await fetch("/api/notifications/read-all", { method: "PATCH" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      qc.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
    },
  });
}
