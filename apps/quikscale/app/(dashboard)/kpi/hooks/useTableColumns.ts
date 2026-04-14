import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";

const COL_WIDTHS_DEFAULT: Record<string, number> = {
  progress: 160, owner: 140, kpiName: 220,
  team: 140, teamHead: 140, kpiOwner: 180,
  measurementUnit: 120, targetValue: 90,
  quarterlyGoal: 110, qtdGoal: 100, qtdAchieved: 110, weeklyGoal: 100,
  description: 160,
};
const WEEK_WIDTH_DEFAULT = 110;

export const ALL_STATIC_COLS = [
  "progress", "owner", "kpiName",
  "team", "teamHead", "kpiOwner",
  "measurementUnit", "targetValue",
  "quarterlyGoal", "qtdGoal", "qtdAchieved", "weeklyGoal",
  "description",
];

export const COL_LABELS: Record<string, string> = {
  progress: "Progress", owner: "Owner", kpiName: "KPI Name",
  team: "Team", teamHead: "Team Head", kpiOwner: "KPI Owner",
  measurementUnit: "Measurement Unit", targetValue: "Target Value",
  quarterlyGoal: "Quarterly Goal", qtdGoal: "QTD Goal", qtdAchieved: "QTD Achieved", weeklyGoal: "Weekly Goal",
  description: "Description",
};

export const SORT_KEYS: Record<string, string> = {
  progress: "progressPercent", owner: "owner", kpiName: "name",
  // teamHead and kpiOwner are not server-sortable — no entry = no sort menu option
  measurementUnit: "measurementUnit", targetValue: "target",
  quarterlyGoal: "quarterlyGoal", qtdGoal: "qtdGoal", qtdAchieved: "qtdAchieved", weeklyGoal: "qtdGoal",
  description: "description",
};

export function useTableColumns(allCols: string[], kpiIds: string[]) {
  const {
    frozenCol: frozenUpTo,
    setFrozenCol,
    hiddenCols: hiddenColsArr,
    hideCol,
    showCol,
    showAllCols,
    colWidths: persistedWidths,
    saveColWidths,
  } = useTablePrefs("kpi");

  // Expose as a Set for existing callers
  const hiddenCols = useMemo(() => new Set(hiddenColsArr), [hiddenColsArr]);

  // Local state during drag — mirrors persistedWidths but updates on every mousemove
  const [localWidths, setLocalWidths] = useState<Record<string, number>>({});

  // Merge: use localWidths override during drag, else persistedWidths, else defaults
  const colWidths = useMemo(() => {
    return { ...COL_WIDTHS_DEFAULT, ...persistedWidths, ...localWidths };
  }, [persistedWidths, localWidths]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const resizeRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

  // Global mousemove/mouseup for column resize dragging
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizeRef.current) return;
      const { col, startX, startWidth } = resizeRef.current;
      const newWidth = Math.max(48, startWidth + (e.clientX - startX));
      setLocalWidths((w) => ({ ...w, [col]: newWidth }));
    }
    function onMouseUp() {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      // Persist the final widths to DB (merged with any existing persistedWidths)
      setLocalWidths((local) => {
        const merged = { ...persistedWidths, ...local };
        saveColWidths(merged);
        return {}; // clear local overrides since persisted now has them
      });
      // Remove drag cursor from body
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [persistedWidths, saveColWidths]);

  const getColWidth = useCallback((col: string): number => {
    if (colWidths[col] !== undefined) return colWidths[col];
    if (col.startsWith("week")) return WEEK_WIDTH_DEFAULT;
    return COL_WIDTHS_DEFAULT[col] ?? 90;
  }, [colWidths]);

  const isFrozen = useCallback((col: string): boolean => {
    if (!frozenUpTo) return false;
    return allCols.indexOf(col) <= allCols.indexOf(frozenUpTo);
  }, [frozenUpTo, allCols]);

  const startResize = useCallback((col: string, clientX: number) => {
    const current = colWidths[col] ?? (col.startsWith("week") ? WEEK_WIDTH_DEFAULT : COL_WIDTHS_DEFAULT[col] ?? 90);
    resizeRef.current = { col, startX: clientX, startWidth: current };
    // Lock cursor + prevent text selection during drag
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [colWidths]);

  const handleFreezeCol = useCallback((col: string) => {
    setFrozenCol(frozenUpTo === col ? null : col);
  }, [frozenUpTo, setFrozenCol]);
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
  };
}
