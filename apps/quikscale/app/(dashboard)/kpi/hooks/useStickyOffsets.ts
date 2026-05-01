import { useLayoutEffect, useState, useCallback, RefObject } from "react";

/**
 * Computes sticky `left` offsets by reading actual DOM column widths.
 * Eliminates hardcoded pixel constants — offsets always match the real layout.
 *
 * Each `<th>` must have a `data-col-key` attribute matching its column key.
 * Recalculates whenever frozenUpTo, hiddenCols, or colWidths change.
 *
 * Offsets live in state (not a ref) so a measurement update triggers a
 * re-render — without that, freeze/unfreeze/resize cycles would render with
 * stale offsets and never converge, leaving gaps between columns.
 */
export function useStickyOffsets(
  headerRowRef: RefObject<HTMLTableRowElement | null>,
  frozenUpTo: string | null,
  hiddenCols: Set<string>,
  colWidths: Record<string, number>,
) {
  const [offsets, setOffsets] = useState<Map<string, number>>(() => new Map());

  useLayoutEffect(() => {
    if (!headerRowRef.current) {
      setOffsets((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    const ths = headerRowRef.current.querySelectorAll<HTMLElement>("th[data-col-key]");
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
  }, [headerRowRef, frozenUpTo, hiddenCols, colWidths]);

  const getStickyLeft = useCallback(
    (col: string): number => offsets.get(col) ?? 0,
    [offsets],
  );

  return { getStickyLeft };
}
