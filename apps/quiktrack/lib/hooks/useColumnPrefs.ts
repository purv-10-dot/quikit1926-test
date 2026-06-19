"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ColumnPrefs {
  hiddenColumns: string[];
  columnOrder: string[];
}

interface ServerResponse {
  success: boolean;
  data: ColumnPrefs;
}

const SAVE_DEBOUNCE_MS = 400;

/**
 * Persists per-user, per-project column preferences for a given list view.
 * Hidden columns + column order live in `qtUserViewPref` (server-side, syncs
 * across devices). Column widths stay in localStorage — they're per-device
 * by nature and not worth a network round-trip on every drag.
 */
export function useColumnPrefs(viewKey: string, projectId: string | null) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load once per (viewKey, projectId).
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ viewKey });
    if (projectId) params.set("projectId", projectId);
    fetch(`/api/view-prefs?${params.toString()}`)
      .then((r) => r.json() as Promise<ServerResponse>)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setHidden(new Set(res.data.hiddenColumns ?? []));
          setOrder(res.data.columnOrder ?? []);
        }
        setLoaded(true);
      })
      .catch(() => {
        // Best-effort; if the API blips, run with empty prefs and let the
        // next save attempt recover.
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [viewKey, projectId]);

  const persist = useCallback(
    (nextHidden: Set<string>, nextOrder: string[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch("/api/view-prefs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            viewKey,
            projectId: projectId ?? null,
            hiddenColumns: Array.from(nextHidden),
            columnOrder: nextOrder,
          }),
        }).catch(() => {
          // Silent fail — next change retries.
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [viewKey, projectId],
  );

  const hide = useCallback((col: string) => {
    setHidden((prev) => {
      if (prev.has(col)) return prev;
      const next = new Set(prev);
      next.add(col);
      persist(next, order);
      return next;
    });
  }, [order, persist]);

  const show = useCallback((col: string) => {
    setHidden((prev) => {
      if (!prev.has(col)) return prev;
      const next = new Set(prev);
      next.delete(col);
      persist(next, order);
      return next;
    });
  }, [order, persist]);

  const showAll = useCallback(() => {
    setHidden((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      persist(next, order);
      return next;
    });
  }, [order, persist]);

  const setColumnOrder = useCallback((next: string[]) => {
    setOrder(next);
    persist(hidden, next);
  }, [hidden, persist]);

  return { hidden, order, loaded, hide, show, showAll, setColumnOrder };
}

const WIDTHS_KEY_PREFIX = "qt:list:colWidths:";

/**
 * localStorage-backed column widths. Per-device — column width preference
 * doesn't usually need to follow the user across machines.
 */
export function useColumnWidths(viewKey: string, defaults: Record<string, number>) {
  const storageKey = `${WIDTHS_KEY_PREFIX}${viewKey}`;
  const [widths, setWidths] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(widths));
      } catch {
        // Quota or private mode — width prefs are nice-to-have.
      }
    }, 200);
  }, [storageKey, widths]);

  const getColWidth = useCallback(
    (col: string): number => widths[col] ?? defaults[col] ?? 120,
    [widths, defaults],
  );

  const resizeRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizeRef.current) return;
      const { col, startX, startWidth } = resizeRef.current;
      const next = Math.max(48, startWidth + (e.clientX - startX));
      setWidths((w) => ({ ...w, [col]: next }));
    }
    function onUp() {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = useCallback(
    (col: string, clientX: number) => {
      resizeRef.current = { col, startX: clientX, startWidth: widths[col] ?? defaults[col] ?? 120 };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [widths, defaults],
  );

  return { getColWidth, startResize };
}
