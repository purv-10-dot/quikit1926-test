import { useLayoutEffect, useState, useCallback, useMemo, RefObject } from "react";

/**
 * Computes sticky `left` offsets by reading actual DOM column widths.
 * Eliminates hardcoded pixel constants — offsets always match the real layout.
 *
 * Each `<th>` must have a `data-col-key` attribute matching its column key —
 * including the always-frozen left rail (checkbox / log / # cells), otherwise
 * user-frozen columns receive a `left` value that doesn't account for the
 * rail's pixel width and visually overlap it.
 *
 * Recalculates whenever `frozenUpTo`, `hiddenCols`, or `colWidths` change, and
 * (via a childList MutationObserver on the header row) whenever the columns are
 * reordered / added / removed — a pure drag-reorder changes none of those deps.
 *
 * Offsets live in state (not a ref) so a measurement update triggers a
 * re-render — without that, freeze/unfreeze/resize cycles render with stale
 * offsets and never converge, leaving gaps between columns.
 *
 * Originally lived under `apps/quikscale/app/(dashboard)/kpi/hooks/`. Moved
 * here so Weekly Meeting / Daily Huddle / Client tables (and any future
 * table) can share the cascade-freeze pattern without cross-feature imports.
 *
 * ## Fallback (optional 5th argument)
 *
 * On the VERY first render, `useState`'s initial value is an empty `Map` and
 * `useLayoutEffect` hasn't run yet — so `getStickyLeft(col)` would return 0
 * for every frozen column, dropping the cell to `left: 0` where the always-
 * frozen rail (z-[15]) covers it. Users see clipped/missing data even though
 * the cell IS positioned correctly.
 *
 * Passing a `fallback` lets `getStickyLeft` synthesize a position from
 * `colOrder` + `railWidths` + `getColWidth` whenever the DOM-measured value
 * is missing for a key. DOM measurements still take over as soon as
 * `useLayoutEffect` runs, so resized columns stay accurate.
 */
export interface StickyOffsetsFallback {
  /** Render order of every column with `data-col-key` (rail + user). */
  colOrder: readonly string[];
  /** Hardcoded widths for rail keys whose width isn't in `colWidths`
   *  (`_checkbox`, `_log`, `_id`). */
  railWidths: Readonly<Record<string, number>>;
  /** Same `getColWidth` the table uses for its user columns. */
  getColWidth: (col: string) => number;
}

export function useStickyOffsets(
  headerRowRef: RefObject<HTMLTableRowElement | null>,
  frozenUpTo: string | null,
  hiddenCols: Set<string>,
  colWidths: Record<string, number>,
  fallback?: StickyOffsetsFallback,
) {
  const [offsets, setOffsets] = useState<Map<string, number>>(() => new Map());

  useLayoutEffect(() => {
    const row = headerRowRef.current;
    if (!row) {
      setOffsets((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }

    const measure = () => {
      const ths = row.querySelectorAll<HTMLElement>("th[data-col-key]");
      const next = new Map<string, number>();
      let accum = 0;
      ths.forEach((th) => {
        const key = th.dataset.colKey!;
        next.set(key, accum);
        accum += th.offsetWidth;
      });
      setOffsets((prev) => {
        if (prev.size !== next.size) return next;
        for (const [k, v] of next) if (prev.get(k) !== v) return next;
        return prev;
      });
    };

    measure();

    // Re-measure when the header's columns are reordered / added / removed.
    // A drag-reorder moves the keyed <th> nodes (React `insertBefore`) WITHOUT
    // changing frozenUpTo / hiddenCols / colWidths — those keep the same
    // references — so the dependency array below never fires and the offset map
    // would otherwise stay pinned to the OLD column order, leaving an empty gap
    // to the right of the moved column. A childList MutationObserver catches
    // exactly this case. It runs before paint (microtask), so no visible flash,
    // and the equality guard in `measure` prevents any re-render loop.
    const observer = new MutationObserver(measure);
    observer.observe(row, { childList: true });
    return () => observer.disconnect();
  }, [headerRowRef, frozenUpTo, hiddenCols, colWidths]);

  // Pre-compute a fallback offsets map from colWidths + COL_ORDER so the
  // first paint (and any edge case where DOM measurement is unavailable)
  // still produces correct sticky positions. Recomputed when the fallback
  // inputs change.
  const fallbackOffsets = useMemo<Map<string, number>>(() => {
    if (!fallback) return new Map();
    const m = new Map<string, number>();
    let accum = 0;
    for (const col of fallback.colOrder) {
      if (hiddenCols.has(col)) continue;
      m.set(col, accum);
      const w = fallback.railWidths[col] ?? fallback.getColWidth(col);
      accum += w;
    }
    return m;
  }, [fallback, hiddenCols]);

  const getStickyLeft = useCallback(
    (col: string): number => {
      // DOM-measured offset wins when present (accurate after layout + after
      // user-driven resize). Fall back to the colWidths-based computation
      // whenever it's missing — handles the pre-layout first paint.
      const fromDom = offsets.get(col);
      if (fromDom !== undefined) return fromDom;
      const fromFallback = fallbackOffsets.get(col);
      return fromFallback ?? 0;
    },
    [offsets, fallbackOffsets],
  );

  return { getStickyLeft };
}
