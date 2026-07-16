import { useState, useCallback, useMemo } from "react";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";
import { useColumnResize } from "@/lib/hooks/useColumnResize";
import { useColumnOrder } from "@/lib/hooks/useColumnOrder";
import { moveByKey, columnsUnfrozenBy } from "@/lib/utils/columnOrder";

const COL_WIDTHS_DEFAULT: Record<string, number> = {
  progress: 160, owner: 140, kpiName: 260,
  team: 140, teamHead: 140, kpiOwner: 180,
  measurementUnit: 120, targetValue: 90,
  quarterlyGoal: 110, qtdGoal: 100, qtdAchieved: 110, weeklyGoal: 100,
  description: 200, lastNotes: 200,
  importedFromOpsp: 150,
  // Audit columns
  createdBy: 160, updatedBy: 160, createdAt: 130, updatedAt: 130,
};
const WEEK_WIDTH_DEFAULT = 110;

export const ALL_STATIC_COLS = [
  "progress", "owner", "kpiName",
  "team", "teamHead", "kpiOwner",
  "measurementUnit", "targetValue",
  "quarterlyGoal", "qtdGoal", "qtdAchieved", "weeklyGoal",
  "description", "lastNotes",
  "importedFromOpsp",
  // Audit columns — populated by GET /api/kpi (see lib/api/auditUsers.ts).
  "createdBy", "updatedBy", "createdAt", "updatedAt",
];

export const COL_LABELS: Record<string, string> = {
  progress: "Progress", owner: "Owner", kpiName: "KPI Name",
  team: "Team", teamHead: "Team Head", kpiOwner: "KPI Owner",
  measurementUnit: "Measurement Unit", targetValue: "Target Value",
  quarterlyGoal: "Quarterly Goal", qtdGoal: "QTD Goal", qtdAchieved: "QTD Achieved", weeklyGoal: "Weekly Goal",
  description: "Description", lastNotes: "Last Notes",
  importedFromOpsp: "Imported from OPSP",
  createdBy: "Created By", updatedBy: "Updated By",
  createdAt: "Created Date", updatedAt: "Updated Date",
};

export const SORT_KEYS: Record<string, string> = {
  progress: "progressPercent", owner: "owner", kpiName: "name",
  // teamHead and kpiOwner are not server-sortable — no entry = no sort menu option
  measurementUnit: "measurementUnit", targetValue: "target",
  quarterlyGoal: "quarterlyGoal", qtdGoal: "qtdGoal", qtdAchieved: "qtdAchieved",
  // weeklyGoal intentionally NOT sortable — it's a per-row computed value
  // (kpi.weeklyTargets[currentWeek] or target/13 fallback). Pretending to sort
  // by qtdGoal here was misleading and hid the bug from the user.
  description: "description",
};

export function useTableColumns(weekCols: string[], kpiIds: string[]) {
  const {
    frozenCol: frozenUpTo,
    setFrozenCol,
    hiddenCols: hiddenColsArr,
    hideCol,
    showCol,
    showAllCols,
  } = useTablePrefs("kpi");

  // Per-user drag-and-drop order of the STATIC columns. Week columns are never
  // reorderable (time-series) and always render after the static block.
  const {
    orderedCols: orderedStaticCols,
    applyOrder: applyStaticOrder,
    resetOrder: resetColumnOrder,
    isCustomized: isOrderCustomized,
  } = useColumnOrder("kpi", ALL_STATIC_COLS);

  // Full render order (used for freeze index math + sticky offsets).
  const allCols = useMemo(
    () => [...orderedStaticCols, ...weekCols],
    [orderedStaticCols, weekCols],
  );

  // Expose as a Set for existing callers
  const hiddenCols = useMemo(() => new Set(hiddenColsArr), [hiddenColsArr]);

  // Build a defaults map that covers BOTH static cols and week cols. Shared
  // `useColumnResize` expects a flat Record<string, number>; week cols
  // (week1..week13) default to WEEK_WIDTH_DEFAULT.
  const defaults = useMemo(() => {
    const d = { ...COL_WIDTHS_DEFAULT };
    for (const c of weekCols) d[c] = WEEK_WIDTH_DEFAULT;
    return d;
  }, [weekCols]);

  // Drag-to-resize is now provided by the shared hook (same as Priority/WWW).
  // It wires startResize → mousemove → saveColWidths via useTablePrefs under
  // the hood, so persistence is unchanged from the old inline implementation.
  const { getColWidth, startResize, colWidths } = useColumnResize("kpi", defaults);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const isFrozen = useCallback((col: string): boolean => {
    if (!frozenUpTo) return false;
    return allCols.indexOf(col) <= allCols.indexOf(frozenUpTo);
  }, [frozenUpTo, allCols]);

  const handleFreezeCol = useCallback((col: string) => {
    setFrozenCol(frozenUpTo === col ? null : col);
  }, [frozenUpTo, setFrozenCol]);

  /**
   * Given a drag of static column `fromKey` onto `toKey` (dropping on `side`),
   * compute the resulting static order and which columns the move would
   * unfreeze. Unfreeze detection runs against the FULL order (static + weeks)
   * so a frozen week boundary is respected. Pure — caller commits with
   * `applyStaticOrder` after any needed confirmation.
   */
  const computeStaticReorder = useCallback(
    (fromKey: string, toKey: string, side: "before" | "after") => {
      const nextStatic = moveByKey(orderedStaticCols, fromKey, toKey, side);
      const nextAll = [...nextStatic, ...weekCols];
      const unfrozen = columnsUnfrozenBy(allCols, nextAll, frozenUpTo);
      return { nextStatic, unfrozen };
    },
    [orderedStaticCols, weekCols, allCols, frozenUpTo],
  );
  const handleHideCol = useCallback((col: string) => hideCol(col), [hideCol]);
  const handleShowCol = useCallback((col: string) => showCol(col), [showCol]);
  const handleShowAllCols = useCallback(() => showAllCols(), [showAllCols]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const toggleAll = useCallback(() => {
    setSelectedIds(s => s.size === kpiIds.length ? new Set() : new Set(kpiIds));
  }, [kpiIds]);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  return {
    colWidths, frozenUpTo, hiddenCols, selectedIds,
    getColWidth, isFrozen, startResize,
    handleFreezeCol, handleHideCol, handleShowCol, handleShowAllCols,
    toggleSelect, toggleAll, clearSelection,
    // Column ordering
    orderedStaticCols, allCols,
    computeStaticReorder, applyStaticOrder, resetColumnOrder, isOrderCustomized,
  };
}
