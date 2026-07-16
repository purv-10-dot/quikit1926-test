"use client";

/**
 * useColumnOrder — per-user drag-and-drop column ordering for any QuikScale
 * data grid. Persists to the DB via `useTablePrefs` (same store as freeze /
 * hidden / widths), keyed by `TableName`.
 *
 * The hook is deliberately layout-agnostic: it takes the table's *default*
 * column order and returns the *effective* order (saved order merged with
 * defaults — new columns appended at the end, removed columns pruned). Callers
 * iterate `orderedCols` for both header and body so the two can never diverge.
 *
 * Reordering that would unfreeze a currently-frozen column is the caller's
 * concern (it needs `useConfirm`) — this hook exposes the pure building blocks
 * (`computeReorder`, `frozenCol`) so the component can gate the commit.
 */

import { useCallback, useMemo } from "react";
import { useTablePrefs, type TableName } from "./useTablePreferences";
import {
  computeEffectiveOrder,
  moveByKey,
  columnsUnfrozenBy,
} from "@/lib/utils/columnOrder";

export interface UseColumnOrderOptions {
  /** Rail columns (checkbox/log/id) that are never reorderable or unfreezable. */
  alwaysFrozen?: readonly string[];
}

export function useColumnOrder(
  table: TableName,
  defaultOrder: readonly string[],
  options: UseColumnOrderOptions = {},
) {
  const { colOrder, setColumnOrder, frozenCol } = useTablePrefs(table);
  // Memoize so it's a stable dependency for the callbacks below (callers
  // typically pass a fresh array literal each render).
  const optAlwaysFrozen = options.alwaysFrozen;
  const alwaysFrozen = useMemo(
    () => optAlwaysFrozen ?? [],
    [optAlwaysFrozen],
  );

  // Effective order = saved order merged with the current default set.
  const orderedCols = useMemo(
    () => computeEffectiveOrder(defaultOrder, colOrder),
    [defaultOrder, colOrder],
  );

  /**
   * Given a drag from `fromKey` to `toKey` (dropping on `side` of the target),
   * return the resulting order plus which columns (if any) it would unfreeze.
   * Pure — does NOT persist. The caller commits with `applyOrder`.
   */
  const computeReorder = useCallback(
    (fromKey: string, toKey: string, side: "before" | "after" = "before") => {
      // Rail columns can neither be dragged nor be a drop target.
      if (alwaysFrozen.includes(fromKey) || alwaysFrozen.includes(toKey)) {
        return { nextOrder: orderedCols, unfrozen: [] as string[] };
      }
      const nextOrder = moveByKey(orderedCols, fromKey, toKey, side);
      const unfrozen = columnsUnfrozenBy(orderedCols, nextOrder, frozenCol, alwaysFrozen);
      return { nextOrder, unfrozen };
    },
    [orderedCols, frozenCol, alwaysFrozen],
  );

  /** Persist an explicit order (the full effective order array). */
  const applyOrder = useCallback(
    (nextOrder: string[]) => setColumnOrder(nextOrder),
    [setColumnOrder],
  );

  /** Reset back to the table's default order. */
  const resetOrder = useCallback(() => setColumnOrder([]), [setColumnOrder]);

  /** True when the user has a non-default order saved. */
  const isCustomized = colOrder.length > 0;

  return {
    orderedCols,
    computeReorder,
    applyOrder,
    resetOrder,
    isCustomized,
    frozenCol,
  };
}
