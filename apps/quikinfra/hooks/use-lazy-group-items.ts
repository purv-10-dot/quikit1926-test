"use client";

/**
 * useLazyGroupItems — server-side, scroll-loaded item fetch for the material
 * picker's "items in a group" step. Instead of loading the entire item master
 * into the browser, the picker fetches just the active group's items from
 * `/api/masters/items?groupId=…&search=…&page=…` and appends the next page as
 * the user scrolls.
 *
 * Reloads page 1 whenever the group or (debounced) search changes; `loadMore`
 * appends the next page. A `seq` guard drops stale responses when the group /
 * search changes mid-flight.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/react-query/fetch-json";

export interface LazyItem {
  id: string;
  name?: string;
  code?: string;
  uomCode?: string;
  uomCodes?: string[];
  groupId?: string;
  groupName?: string;
  hsnCode?: string;
  [key: string]: unknown;
}

interface Envelope {
  data: LazyItem[];
  total?: number;
}

export function useLazyGroupItems(params: {
  groupId: string | null;
  search: string;
  enabled: boolean;
  pageSize?: number;
}): {
  items: LazyItem[];
  total: number;
  hasMore: boolean;
  loading: boolean;
  loadMore: () => void;
} {
  const { groupId, search, enabled, pageSize = 50 } = params;
  const [items, setItems] = useState<LazyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const buildUrl = useCallback(
    (p: number) => {
      const qs = new URLSearchParams();
      qs.set("page", String(p));
      qs.set("pageSize", String(pageSize));
      if (groupId) qs.set("groupId", groupId);
      const q = search.trim();
      if (q) qs.set("search", q);
      return `/api/masters/items?${qs.toString()}`;
    },
    [groupId, search, pageSize],
  );

  // (Re)load page 1 when group / search / enabled change.
  useEffect(() => {
    if (!enabled || !groupId) {
      setItems([]);
      setTotal(0);
      setPage(1);
      return;
    }
    const mySeq = ++seq.current;
    setLoading(true);
    fetchJson<Envelope>(buildUrl(1))
      .then((res) => {
        if (mySeq !== seq.current) return;
        setItems(res.data ?? []);
        setTotal(res.total ?? (res.data?.length ?? 0));
        setPage(1);
      })
      .catch(() => {
        if (mySeq !== seq.current) return;
        setItems([]);
        setTotal(0);
      })
      .finally(() => {
        if (mySeq === seq.current) setLoading(false);
      });
  }, [enabled, groupId, buildUrl]);

  const hasMore = items.length < total;

  const loadMore = useCallback(() => {
    if (!enabled || !groupId || loading || !hasMore) return;
    const next = page + 1;
    const mySeq = seq.current;
    setLoading(true);
    fetchJson<Envelope>(buildUrl(next))
      .then((res) => {
        if (mySeq !== seq.current) return;
        setItems((prev) => prev.concat(res.data ?? []));
        setPage(next);
        if (typeof res.total === "number") setTotal(res.total);
      })
      .finally(() => {
        if (mySeq === seq.current) setLoading(false);
      });
  }, [enabled, groupId, loading, hasMore, page, buildUrl]);

  return { items, total, hasMore, loading, loadMore };
}
