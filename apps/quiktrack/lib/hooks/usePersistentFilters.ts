"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Auto-persists a surface's filter state per user + project + viewKey via
 * /api/view-prefs (which upserts on the unique [userId, projectId, viewKey]).
 * There is no Save button and no naming — the filter simply "sticks".
 *
 * Controlled model: the surface owns its filter state (it can be split across
 * several useState vars). This hook only (a) hydrates the last-saved filters on
 * mount by calling `applySaved`, and (b) writes the combined `filters` object
 * back, debounced, whenever it actually changes after hydration.
 *
 *   const filters = useMemo(() => ({ ... }), [a, b, c]);
 *   useFilterPersistence({
 *     viewKey: "spaces-board", projectId, filters,
 *     applySaved: (s) => { if (typeof s.type === "string") setType(s.type); ... },
 *   });
 */
interface Args<T extends object> {
  viewKey: string;
  projectId?: string | null;
  /** The current combined filter object the surface renders from. */
  filters: T;
  /** Apply hydrated filters to the surface's own state. */
  applySaved: (saved: Partial<T>) => void;
  /** Skip hydration (e.g. a deep-link from the URL should win for this visit). */
  skipHydrate?: boolean;
  debounceMs?: number;
}

export function useFilterPersistence<T extends object>(args: Args<T>): { ready: boolean } {
  const { viewKey, projectId = null, filters, applySaved, skipHydrate = false, debounceMs = 500 } = args;

  const [ready, setReady] = useState(false);
  // Serialized snapshot of the last value we've accounted for, so we never
  // re-write an unchanged value (incl. the no-op right after hydration).
  const lastSerialized = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyRef = useRef(applySaved);
  applyRef.current = applySaved;

  // Hydrate once from saved prefs.
  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams({ viewKey });
    if (projectId) qs.set("projectId", projectId);
    fetch(`/api/view-prefs?${qs.toString()}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        const saved = j?.success ? j.data?.filters : null;
        if (!skipHydrate && saved && typeof saved === "object") {
          applyRef.current(saved as Partial<T>);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!alive) return;
        setReady(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, projectId]);

  // Persist on change after hydration. The first settle adopts the current
  // value as the baseline (no write); only genuine user changes write.
  useEffect(() => {
    if (!ready) return;
    const serialized = JSON.stringify(filters);
    if (lastSerialized.current === null) {
      lastSerialized.current = serialized;
      return;
    }
    if (serialized === lastSerialized.current) return;
    lastSerialized.current = serialized;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void fetch(`/api/view-prefs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewKey, projectId, filters }),
      }).catch(() => undefined);
    }, debounceMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, filters]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { ready };
}
