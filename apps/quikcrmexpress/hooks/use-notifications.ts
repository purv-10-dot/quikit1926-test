"use client";

/**
 * Notification hooks.
 *
 * Three concerns:
 *   1. useNotifications()     — paginated list with React Query (cache + re-fetch).
 *   2. useUnreadCount()       — lightweight badge count with 60s poll fallback.
 *   3. useNotificationStream() — SSE subscription that invalidates the cache
 *                                when a new notification arrives; falls back to
 *                                polling when Redis / SSE is unavailable.
 *
 * All three are designed to be mounted at the NotificationBell level so only
 * one SSE connection is open per tab regardless of how many components
 * reference the bell.
 */

import { useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NotificationRow } from "@/lib/notifications/types";

// ─── Realtime event shape ─────────────────────────────────────────────────────

/** Minimal payload pushed over SSE — mirrors lib/notifications/realtime.ts. */
export interface IncomingNotification {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  link: string | null;
  createdAt: string;
}

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
      const json = await res.json();
      return json?.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

// ─── Unread count hook ────────────────────────────────────────────────────────

/** Fast badge count. Polled every 60s as a fallback when SSE is unavailable. */
export function useUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread-count");
      if (!res.ok) return { count: 0 };
      const json = await res.json();
      return json?.data ?? { count: 0 };
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

// ─── SSE stream hook ──────────────────────────────────────────────────────────

/**
 * Subscribe to the per-user SSE notification stream.
 * On each "notification" event, the list and count caches are invalidated so
 * the bell badge and panel update immediately without a manual refresh, and the
 * optional `onNotification` callback fires (used to surface a live toast).
 *
 * @param enabled - Pass false when the component is unmounted / hidden to
 *                  avoid keeping an SSE connection open unnecessarily.
 * @param onNotification - Called with the parsed event each time one arrives.
 */
export function useNotificationStream(
  enabled = true,
  onNotification?: (n: IncomingNotification) => void,
) {
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);
  // Keep the latest callback in a ref so we don't tear down the EventSource
  // every time the caller passes a new inline function.
  const cbRef = useRef(onNotification);
  cbRef.current = onNotification;
  // Track how many consecutive errors we've seen so we can give up after
  // a few retries rather than hammering reconnects.
  const errorCountRef = useRef(0);
  const MAX_ERRORS = 5;

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const connect = () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }

      const es = new EventSource("/api/notifications/stream");
      esRef.current = es;

      es.addEventListener("hello", () => {
        // Connection confirmed — reset the error counter.
        errorCountRef.current = 0;
      });

      es.addEventListener("notification", (e) => {
        // A new notification arrived — refresh the list and the badge count.
        void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
        void qc.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
        // Surface it to the caller (toast pop-up) — parse defensively.
        try {
          const data = JSON.parse((e as MessageEvent).data) as IncomingNotification;
          cbRef.current?.(data);
        } catch {
          /* ignore malformed payloads — the cache invalidation already ran */
        }
      });

      es.addEventListener("error", () => {
        errorCountRef.current += 1;
        if (errorCountRef.current >= MAX_ERRORS) {
          // Stream is wedged; stop trying. Polling via refetchInterval on
          // useUnreadCount() keeps the badge approximately up to date.
          es.close();
          esRef.current = null;
        }
        // For fewer errors, EventSource will auto-reconnect after ~3 s.
      });
    };

    connect();

    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [enabled, qc]);
}
