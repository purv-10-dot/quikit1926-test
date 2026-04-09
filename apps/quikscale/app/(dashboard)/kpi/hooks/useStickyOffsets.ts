import { useLayoutEffect, useRef, useCallback, RefObject } from "react";

/**
 * Computes sticky `left` offsets by reading actual DOM column widths.
 * Eliminates hardcoded pixel constants — offsets always match the real layout.
 *
 * Each `<th>` must have a `data-col-key` attribute matching its column key.
 * Recalculates whenever frozenUpTo, hiddenCols, or colWidths change.
 */
export function useStickyOffsets(
  headerRowRef: RefObject<HTMLTableRowElement | null>,
  frozenUpTo: string | null,
  hiddenCols: Set<string>,
  colWidths: Record<string, number>,
) {
  const offsetsRef = useRef<Map<string, number>>(new Map());

  useLayoutEffect(() => {
    if (!headerRowRef.current) {
      offsetsRef.current.clear();
      return;
    }
    const ths = headerRowRef.current.querySelectorAll<HTMLElement>("th[data-col-key]");
    const map = new Map<string, number>();
    let accum = 0;
    ths.forEach((th) => {
      const key = th.dataset.colKey!;
      map.set(key, accum);
      accum += th.offsetWidth;
    });
    offsetsRef.current = map;
  }, [headerRowRef, frozenUpTo, hiddenCols, colWidths]);

  const getStickyLeft = useCallback(
    (col: string): number => offsetsRef.current.get(col) ?? 0,
    [],
  );

  return { getStickyLeft };
}
