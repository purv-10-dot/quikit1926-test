import { useState, useRef, useEffect, useCallback } from "react";

const COL_WIDTHS_DEFAULT: Record<string, number> = {
  progress: 160, owner: 140, kpiName: 220, measurementUnit: 120, targetValue: 90, description: 160,
};
const WEEK_WIDTH_DEFAULT = 110;
const LS_KEY = "kpi-col-widths";

export const ALL_STATIC_COLS = ["progress", "owner", "kpiName", "measurementUnit", "targetValue", "description"];

export const COL_LABELS: Record<string, string> = {
  progress: "Progress", owner: "Owner", kpiName: "KPI Name",
  measurementUnit: "Measurement Unit", targetValue: "Target Value", description: "Description",
};

export const SORT_KEYS: Record<string, string> = {
  progress: "progressPercent", owner: "owner", kpiName: "name",
  measurementUnit: "measurementUnit", targetValue: "target", description: "description",
};

export function useTableColumns(allCols: string[], kpiIds: string[]) {
  const [colWidths, setColWidths] = useState<Record<string, number>>({ ...COL_WIDTHS_DEFAULT });
  const [frozenUpTo, setFrozenUpTo] = useState<string | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const resizeRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

  // Load persisted widths on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, number>;
        setColWidths(w => ({ ...w, ...parsed }));
      }
    } catch {}
  }, []);

  // Global mousemove/mouseup for column resize dragging
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizeRef.current) return;
      const { col, startX, startWidth } = resizeRef.current;
      const newWidth = Math.max(48, startWidth + (e.clientX - startX));
      setColWidths(w => ({ ...w, [col]: newWidth }));
    }
    function onMouseUp() {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      setColWidths(current => {
        try { localStorage.setItem(LS_KEY, JSON.stringify(current)); } catch {}
        return current;
      });
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

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
    resizeRef.current = { col, startX: clientX, startWidth: colWidths[col] ?? (col.startsWith("week") ? WEEK_WIDTH_DEFAULT : COL_WIDTHS_DEFAULT[col] ?? 90) };
  }, [colWidths]);

  const handleFreezeCol = useCallback((col: string) => setFrozenUpTo(f => f === col ? null : col), []);
  const handleHideCol = useCallback((col: string) => setHiddenCols(s => { const n = new Set(s); n.add(col); return n; }), []);
  const handleShowCol = useCallback((col: string) => setHiddenCols(s => { const n = new Set(s); n.delete(col); return n; }), []);

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
    handleFreezeCol, handleHideCol, handleShowCol,
    toggleSelect, toggleAll, clearSelection,
  };
}
