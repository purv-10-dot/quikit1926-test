"use client";

/**
 * useDataTableGrid — brings the shared global-grid COLUMN features (per-user
 * freeze / hide / sort / resize / column drag-reorder) to any page that renders
 * the `<DataTable>` primitive, without rewriting it.
 *
 * It's the DataTable-shaped sibling of <FeatureGrid> (which owns flat CRUD
 * grids). Given a base column config + a `TableName`, it reads the shared
 * `useTablePrefs`/`useColumnOrder`/`useColumnResize` stack and returns a
 * transformed `DataTableColumn[]` (reordered, hidden filtered, widths applied,
 * frozen columns marked sticky, headers wrapped with sort/freeze/hide/drag/
 * resize affordances) plus an `applySort` helper for the page's rows.
 *
 * Read-only reporting tables (e.g. OPSP Review) only need COLUMN features — no
 * row-drag / trash / pagination — so those are intentionally absent.
 */

import { useCallback, useMemo, useRef } from "react";
import { ColMenu, useConfirm, type DataTableColumn } from "@quikit/ui";
import { cn } from "@/lib/utils";
import { useTablePrefs, type TableName } from "@/lib/hooks/useTablePreferences";
import { useColumnOrder } from "@/lib/hooks/useColumnOrder";
import { useColumnResize, ResizeHandle } from "@/lib/hooks/useColumnResize";
import { useColumnDnD, DragHandle } from "@/lib/hooks/useColumnDnD";
import { frozenColumns, moveByKey, columnsUnfrozenBy, columnsFrozenBy } from "@/lib/utils/columnOrder";
import { confirmFreezeChange } from "@/lib/utils/freezeConfirm";
import { sortGroups, type SortDir, type SortPrimitive } from "@/lib/utils/groupSort";
import { FreezeIcon } from "@/components/ui/FreezeIcon";

export interface GridColumn<T> extends DataTableColumn<T> {
  /** Header offers Sort Asc/Desc + shows the active arrow. */
  sortable?: boolean;
  /** Value used to rank a row when this column is the active sort. Required for
   *  a `sortable` column (its `render` returns ReactNode, not a value). */
  sortAccessor?: (row: T) => SortPrimitive;
  /** Plain-text label for the Manage Columns modal (defaults to `label` when it
   *  is a string, else the key). */
  menuLabel?: string;
}

function parseSort(sort: string | null | undefined): { sortBy: string | null; sortOrder: SortDir } {
  if (!sort) return { sortBy: null, sortOrder: "asc" };
  const [key, dir] = sort.split(":");
  if (!key) return { sortBy: null, sortOrder: "asc" };
  return { sortBy: key, sortOrder: dir === "desc" ? "desc" : "asc" };
}

export interface UseDataTableGridResult<T> {
  /** Attach to a wrapping element around the `<DataTable>` — powers column-drag
   *  hit-testing (`thead tr` is queried within it). */
  containerRef: React.RefObject<HTMLDivElement>;
  /** Transformed columns to hand straight to `<DataTable columns={...}>`. */
  columns: DataTableColumn<T>[];
  sortBy: string | null;
  sortOrder: SortDir;
  /** Sort a row list by the active column, group-aware. `groupKey` identifies a
   *  category group (rows sharing it stay contiguous); `pickRow` chooses the
   *  representative row whose value ranks the group (default: first row). */
  applySort: (
    rows: T[],
    groupKey: (row: T) => string | number,
    pickRow?: (groupRows: T[]) => T,
  ) => T[];
  /** {key,label} list of hideable (non-rail) columns for a Manage Columns modal. */
  manageColumns: { key: string; label: string }[];
  hiddenCols: string[];
  setHiddenCols: (next: string[]) => void;
}

export function useDataTableGrid<T>({
  table,
  columns,
  railKeys = [],
}: {
  table: TableName;
  columns: GridColumn<T>[];
  /** Leading rail columns (checkbox / log / #) — never hidden, sorted, dragged,
   *  or unfrozen; always pinned to the left. */
  railKeys?: string[];
}): UseDataTableGridResult<T> {
  const containerRef = useRef<HTMLDivElement>(null);
  const confirmDialog = useConfirm();

  const { hiddenCols, hideCol, setHiddenCols, sort, setSort, frozenCol, setFrozenCol } =
    useTablePrefs(table);
  const { sortBy, sortOrder } = parseSort(sort);

  const railSet = useMemo(() => new Set(railKeys), [railKeys]);
  const colByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  const nonRailKeys = useMemo(
    () => columns.filter((c) => !railSet.has(c.key)).map((c) => c.key),
    [columns, railSet],
  );
  const widthDefaults = useMemo(() => {
    const d: Record<string, number> = {};
    for (const c of columns) d[c.key] = c.width ?? 140;
    return d;
  }, [columns]);

  const { orderedCols: orderedNonRail, applyOrder } = useColumnOrder(table, nonRailKeys, {
    alwaysFrozen: railKeys,
  });
  const { getColWidth, startResize } = useColumnResize(table, widthDefaults);

  const fullOrder = useMemo(() => [...railKeys, ...orderedNonRail], [railKeys, orderedNonRail]);
  const frozenSet = useMemo(
    () => frozenColumns(fullOrder, frozenCol, railKeys),
    [fullOrder, frozenCol, railKeys],
  );

  // ── Column drag-reorder (freeze-crossing confirm) ──
  const handleColDrop = useCallback(
    async (fromKey: string, toKey: string, side: "before" | "after") => {
      const nextNonRail = moveByKey(orderedNonRail, fromKey, toKey, side);
      const nextFull = [...railKeys, ...nextNonRail];
      const curFull = [...railKeys, ...orderedNonRail];
      const unfrozen = columnsUnfrozenBy(curFull, nextFull, frozenCol, railKeys);
      const frozen = columnsFrozenBy(curFull, nextFull, frozenCol, railKeys);
      if (!(await confirmFreezeChange(confirmDialog, unfrozen, frozen))) return;
      applyOrder(nextNonRail);
    },
    [orderedNonRail, railKeys, frozenCol, applyOrder, confirmDialog],
  );
  const colDnd = useColumnDnD({
    getHeaderRow: () => containerRef.current?.querySelector("thead tr") ?? null,
    onDrop: handleColDrop,
    canReorder: (col) => orderedNonRail.includes(col),
  });
  const dropIndicatorClass = useCallback(
    (col: string) => {
      if (colDnd.overKey !== col || !colDnd.dropSide) return "";
      return colDnd.dropSide === "before"
        ? "shadow-[inset_2px_0_0_0_var(--tw-shadow-color)] shadow-blue-500"
        : "shadow-[inset_-2px_0_0_0_var(--tw-shadow-color)] shadow-blue-500";
    },
    [colDnd.overKey, colDnd.dropSide],
  );

  const handleSetSort = useCallback(
    (key: string, dir: SortDir) => setSort(`${key}:${dir}`),
    [setSort],
  );
  const clearSort = useCallback(() => setSort(null), [setSort]);
  const handleFreeze = useCallback(
    (key: string) => setFrozenCol(frozenCol === key ? null : key),
    [frozenCol, setFrozenCol],
  );

  const transformedColumns = useMemo<DataTableColumn<T>[]>(() => {
    const visible = fullOrder.filter((k) => colByKey.has(k) && !hiddenCols.includes(k));
    return visible.map((key) => {
      const base = colByKey.get(key)!;
      const isRail = railSet.has(key);
      const width = getColWidth(key);
      const frozen = frozenSet.has(key);
      const boundary = key === frozenCol;

      // Rail columns keep their raw header (checkbox / "#") — no menu/drag.
      const label = isRail ? (
        base.label
      ) : (
        <div className="flex items-center gap-1 pr-4">
          <DragHandle onStart={(e) => colDnd.startDrag(key, e)} />
          {boundary && <FreezeIcon />}
          <span
            className="flex-1 truncate cursor-grab active:cursor-grabbing touch-none"
            onPointerDown={(e) => colDnd.startDrag(key, e)}
          >
            {base.label}
            {base.sortable && sortBy === key && (sortOrder === "asc" ? " ↑" : " ↓")}
          </span>
          <ColMenu
            colKey={key}
            onSort={base.sortable ? (d) => handleSetSort(key, d) : undefined}
            activeSort={base.sortable && sortBy === key ? sortOrder : null}
            onClearSort={base.sortable ? clearSort : undefined}
            onFreeze={() => handleFreeze(key)}
            onHide={() => hideCol(key)}
            frozen={boundary}
            showSort={!!base.sortable}
          />
          <ResizeHandle onStart={(e) => startResize(key, e.clientX)} />
        </div>
      );

      return {
        ...base,
        label,
        width,
        sticky: frozen || base.sticky,
        thClassName: cn(
          base.thClassName,
          // `group relative`: `group` lets the header's hover reveal the ⋮ menu +
          // drag grip (both use `group-hover:opacity-100`); `relative` anchors the
          // absolute ResizeHandle to the full <th> edge. Without `group` the
          // controls stay `opacity-0` and the grid looks featureless.
          !isRail && "group relative",
          dropIndicatorClass(key),
          colDnd.draggingKey === key && "opacity-40",
        ),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fullOrder, colByKey, hiddenCols, railSet, frozenSet, frozenCol, getColWidth,
    sortBy, sortOrder, colDnd.draggingKey, colDnd.overKey, colDnd.dropSide,
    handleSetSort, clearSort, handleFreeze, hideCol, startResize, dropIndicatorClass,
  ]);

  const applySort = useCallback(
    (rows: T[], groupKey: (row: T) => string | number, pickRow?: (g: T[]) => T): T[] => {
      if (!sortBy) return rows;
      const col = colByKey.get(sortBy);
      if (!col?.sortable || !col.sortAccessor) return rows;
      const accessor = col.sortAccessor;
      const pick = pickRow ?? ((g: T[]) => g[0]);
      return sortGroups(rows, groupKey, (g) => accessor(pick(g)), sortOrder);
    },
    [sortBy, sortOrder, colByKey],
  );

  const manageColumns = useMemo(
    () =>
      nonRailKeys.map((k) => {
        const c = colByKey.get(k)!;
        return { key: k, label: c.menuLabel ?? (typeof c.label === "string" ? c.label : k) };
      }),
    [nonRailKeys, colByKey],
  );

  return {
    containerRef,
    columns: transformedColumns,
    sortBy,
    sortOrder,
    applySort,
    manageColumns,
    hiddenCols,
    setHiddenCols,
  };
}
