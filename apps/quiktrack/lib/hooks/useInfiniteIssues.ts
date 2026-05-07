"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cursor-paginated issues fetcher with an IntersectionObserver-driven
 * "load more" sentinel. Backed by `/api/issues` (cursor + limit mode).
 *
 * `enabled` defers the first fetch — used by collapsed groups so we don't
 * burn a request until the user actually expands them.
 */

export interface InfiniteIssuesResult<T> {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  total: number;
  error: string | null;
  /** Attach to the sentinel element at the bottom of the rendered list. */
  sentinelRef: (el: HTMLElement | null) => void;
  /** Forces a reload from the start — call after creating/deleting an item. */
  reload: () => void;
}

interface FetchResponse<T> {
  success: boolean;
  data: T[];
  nextCursor: string | null;
  total: number;
  error?: string;
}

const PAGE_SIZE = 20;

export function useInfiniteIssues<T extends { id: string }>(
  baseQuery: Record<string, string | undefined>,
  enabled: boolean,
): InfiniteIssuesResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Re-stringify on every render to detect query changes; cheap for small obj.
  const queryKey = JSON.stringify(baseQuery);
  const seqRef = useRef(0);

  const buildUrl = useCallback(
    (afterCursor: string | null) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(baseQuery)) {
        if (v != null && v !== "") p.set(k, v);
      }
      p.set("limit", String(PAGE_SIZE));
      if (afterCursor) p.set("cursor", afterCursor);
      return `/api/issues?${p.toString()}`;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryKey],
  );

  // First page (or refetch on query/reload change).
  useEffect(() => {
    if (!enabled) {
      // Reset when disabled so re-enabling starts fresh.
      setItems([]); setCursor(null); setHasMore(false); setTotal(0);
      setLoading(false); setLoadingMore(false); setError(null);
      return;
    }
    const mySeq = ++seqRef.current;
    setLoading(true);
    setError(null);
    fetch(buildUrl(null))
      .then((r) => r.json() as Promise<FetchResponse<T>>)
      .then((res) => {
        if (mySeq !== seqRef.current) return;
        if (!res.success) throw new Error(res.error ?? "Failed to load");
        setItems(res.data ?? []);
        setCursor(res.nextCursor);
        setHasMore(Boolean(res.nextCursor));
        setTotal(res.total ?? 0);
      })
      .catch((e) => {
        if (mySeq !== seqRef.current) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (mySeq === seqRef.current) setLoading(false);
      });
  }, [enabled, buildUrl, reloadTick]);

  const loadMore = useCallback(() => {
    if (!enabled || !hasMore || loading || loadingMore || !cursor) return;
    setLoadingMore(true);
    const mySeq = seqRef.current;
    fetch(buildUrl(cursor))
      .then((r) => r.json() as Promise<FetchResponse<T>>)
      .then((res) => {
        if (mySeq !== seqRef.current) return;
        if (!res.success) throw new Error(res.error ?? "Failed to load");
        setItems((prev) => prev.concat(res.data ?? []));
        setCursor(res.nextCursor);
        setHasMore(Boolean(res.nextCursor));
      })
      .catch((e) => {
        if (mySeq !== seqRef.current) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (mySeq === seqRef.current) setLoadingMore(false);
      });
  }, [enabled, hasMore, loading, loadingMore, cursor, buildUrl]);

  // IntersectionObserver attached to a sentinel — when it scrolls into view,
  // trigger loadMore. Re-observe whenever the sentinel ref / loadMore change.
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useCallback(
    (el: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (!el) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) loadMore();
          }
        },
        { rootMargin: "200px 0px" },
      );
      observerRef.current.observe(el);
    },
    [loadMore],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  return { items, loading, loadingMore, hasMore, total, error, sentinelRef, reload };
}
