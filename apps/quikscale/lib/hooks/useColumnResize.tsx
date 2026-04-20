"use client";

/**
 * useColumnResize — generic drag-to-resize hook for any table.
 *
 * Uses `useTablePrefs` under the hood for persistence (per-user in DB via
 * /api/settings/table-preferences). During a drag, widths update locally on
 * every mousemove; on mouseup, the merged result is persisted.
 *
 * Mirrors the behavior of `useTableColumns` in the KPI table, but without
 * the freeze/hide/selection logic — suitable for any table that just wants
 * column resize.
 *
 * Usage:
 *   const { getColWidth, startResize } = useColumnResize("priority", COL_WIDTHS_DEFAULT);
 *
 *   <th style={{ width: getColWidth("name") }}>
 *     Name
 *     <ResizeHandle onStart={e => startResize("name", e.clientX)} />
 *   </th>
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTablePrefs, type TableName } from "./useTablePreferences";

const MIN_COL_WIDTH = 48;

export function useColumnResize(
  table: TableName,
  defaults: Record<string, number>,
) {
  const { colWidths: persistedWidths, saveColWidths } = useTablePrefs(table);

  // Local override during drag — cleared on mouseup after persisting
  const [localWidths, setLocalWidths] = useState<Record<string, number>>({});
  const resizeRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

  const merged = useMemo(
    () => ({ ...defaults, ...persistedWidths, ...localWidths }),
    [defaults, persistedWidths, localWidths],
  );

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizeRef.current) return;
      const { col, startX, startWidth } = resizeRef.current;
      const newWidth = Math.max(MIN_COL_WIDTH, startWidth + (e.clientX - startX));
      setLocalWidths((w) => ({ ...w, [col]: newWidth }));
    }
    function onMouseUp() {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      setLocalWidths((local) => {
        if (Object.keys(local).length === 0) return local;
        const mergedSave = { ...persistedWidths, ...local };
        saveColWidths(mergedSave);
        return {}; // clear local now that it's persisted
      });
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

  const getColWidth = useCallback(
    (col: string): number => {
      return merged[col] ?? defaults[col] ?? 90;
    },
    [merged, defaults],
  );

  const startResize = useCallback(
    (col: string, clientX: number) => {
      const current = merged[col] ?? defaults[col] ?? 90;
      resizeRef.current = { col, startX: clientX, startWidth: current };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [merged, defaults],
  );

  return { getColWidth, startResize, colWidths: merged };
}

/**
 * Small reusable resize handle — drop into any <th> with `position: relative`
 * (or a wrapping relative div).
 *
 * Uses the locked-table blue accent (`hover:bg-blue-400/50`) per
 * CLAUDE.md's table chrome rules — same handle style the KPI table uses.
 */
export function ResizeHandle({
  onStart,
}: {
  onStart: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-blue-400/50 z-10"
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onStart(e);
      }}
    />
  );
}
