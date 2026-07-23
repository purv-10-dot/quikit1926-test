"use client";

/**
 * FeatureGrid — one reusable, config-driven data grid that packages the shared
 * QuikScale table stack (per-user column prefs, freeze, sort, hide, column
 * drag-reorder, resize, row drag-reorder, server pagination) behind a single
 * column config. New master-data grids (Category / Unit / Quarter) adopt every
 * feature by describing their columns — they don't re-wire the hooks by hand.
 *
 * What FeatureGrid owns (view state, persisted per-user via `useTablePrefs`):
 *   - column order (useColumnOrder), width (useColumnResize), freeze boundary,
 *     hide, sort direction, and the sticky-left math (useStickyOffsets).
 *   - column drag (useColumnDnD) + row drag (useRowDnD) interactions.
 *
 * What the PAGE owns (server state, passed in):
 *   - the rows + pagination meta (React Query), row selection for bulk actions,
 *     and the reorder/​page callbacks. Sort lives in `useTablePrefs`, so the page
 *     reads it via {@link useGridSort} to build its query — both stay in sync
 *     through the shared prefs cache (no prop threading, single source of truth).
 *
 * The 7 existing feature grids (KPI/Priority/WWW/Client-Meetings) are LOCKED and
 * intentionally NOT migrated onto this — see CLAUDE.md.
 */

import { useCallback, useMemo, useRef } from "react";
import { Pagination, ColMenu, useConfirm } from "@quikit/ui";
import { useTablePrefs, type TableName } from "@/lib/hooks/useTablePreferences";
import { useColumnOrder } from "@/lib/hooks/useColumnOrder";
import { useColumnResize, ResizeHandle } from "@/lib/hooks/useColumnResize";
import { useColumnDnD, DragHandle } from "@/lib/hooks/useColumnDnD";
import { useRowDnD } from "@/lib/hooks/useRowDnD";
import { useStickyOffsets } from "@/lib/hooks/useStickyOffsets";
import { moveByKey, columnsUnfrozenBy, columnsFrozenBy } from "@/lib/utils/columnOrder";
import { confirmFreezeChange } from "@/lib/utils/freezeConfirm";
import { rowNeighbors } from "@/lib/utils/rowOrder";
import { FreezeIcon } from "@/components/ui/FreezeIcon";

export type SortDir = "asc" | "desc";

/** The always-frozen selection rail key. Kept out of the reorderable set. */
const CHECKBOX_COL = "_checkbox";
const CHECKBOX_WIDTH = 44;

export interface FeatureGridColumn<T> {
  /** Stable key — used for prefs (hide/freeze/width/order) + `data-col-key`. */
  key: string;
  /** Header label. */
  label: string;
  /** When true the header offers Sort Asc/Desc (server sort). */
  sortable?: boolean;
  /** Backend sort key when it differs from `key`. Defaults to `key`. */
  sortKey?: string;
  /** Default column width (px) before the user resizes. */
  defaultWidth?: number;
  /** Body-cell text alignment. */
  align?: "left" | "right" | "center";
  /** Render the body cell for a row. */
  render: (row: T) => React.ReactNode;
}

export interface FeatureGridReorderArgs {
  id: string;
  beforeId: string | null;
  afterId: string | null;
}

export interface FeatureGridProps<T> {
  /** Preference bucket — must be a registered `TableName`. */
  table: TableName;
  columns: FeatureGridColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** Label for the row-drag floating ghost. Defaults to the first column's text. */
  getRowLabel?: (row: T) => string;
  loading?: boolean;
  emptyMessage?: React.ReactNode;

  // ── Selection (controlled by the page for bulk delete/restore) ──
  selectable?: boolean;
  selected?: Set<string>;
  onToggleRow?: (id: string) => void;
  onToggleAll?: () => void;
  /** Disable selection entirely (e.g. the user lacks delete permission). */
  selectionDisabled?: boolean;
  /** Message shown when a disabled checkbox is clicked. */
  onSelectionBlocked?: () => void;

  // ── Row interactions ──
  onRowClick?: (row: T) => void;
  /** Enable row drag-reorder. When provided AND `rowReorderEnabled`, a full-row
   *  drag commits via this callback. */
  onReorderRow?: (args: FeatureGridReorderArgs) => void;
  /** Gate row-drag (e.g. false while a sort is active or in Trash view). */
  rowReorderEnabled?: boolean;

  // ── Server pagination (controlled by the page) ──
  page?: number;
  totalPages?: number;
  total?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

/** Parse a `"key:dir"` sort pref into its parts (empty/invalid → no sort). */
export function parseSortPref(sort: string | null | undefined): {
  sortBy: string | null;
  sortOrder: SortDir;
} {
  if (!sort) return { sortBy: null, sortOrder: "asc" };
  const [key, dir] = sort.split(":");
  if (!key) return { sortBy: null, sortOrder: "asc" };
  return { sortBy: key, sortOrder: dir === "desc" ? "desc" : "asc" };
}

/**
 * Read the current sort for a table straight from the shared prefs cache. Pages
 * use this to build their list query; FeatureGrid writes to the same cache, so
 * a header sort click re-renders the page and refetches — no callback plumbing.
 */
export function useGridSort(table: TableName): {
  sortBy: string | null;
  sortOrder: SortDir;
  /** `"key:dir"` for a query string, or "" when unsorted. */
  sortParam: string;
} {
  const { sort } = useTablePrefs(table);
  const { sortBy, sortOrder } = parseSortPref(sort);
  return { sortBy, sortOrder, sortParam: sortBy ? `${sortBy}:${sortOrder}` : "" };
}

export function FeatureGrid<T>({
  table,
  columns,
  rows,
  getRowId,
  getRowLabel,
  loading = false,
  emptyMessage = "No records yet.",
  selectable = false,
  selected,
  onToggleRow,
  onToggleAll,
  selectionDisabled = false,
  onSelectionBlocked,
  onRowClick,
  onReorderRow,
  rowReorderEnabled = false,
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onPageSizeChange,
}: FeatureGridProps<T>) {
  const headerRowRef = useRef<HTMLTableRowElement | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const { hiddenCols, hideCol, sort, setSort, frozenCol, setFrozenCol } = useTablePrefs(table);
  const { sortBy, sortOrder } = parseSortPref(sort);

  // Default (non-rail) order + resize defaults come straight from the config.
  const defaultOrder = useMemo(() => columns.map((c) => c.key), [columns]);
  const railCols = useMemo(() => (selectable ? [CHECKBOX_COL] : []), [selectable]);
  const widthDefaults = useMemo(() => {
    const d: Record<string, number> = { [CHECKBOX_COL]: CHECKBOX_WIDTH };
    for (const c of columns) d[c.key] = c.defaultWidth ?? 160;
    return d;
  }, [columns]);

  const { orderedCols: orderedNonRail, applyOrder } = useColumnOrder(table, defaultOrder, {
    alwaysFrozen: railCols,
  });
  const fullOrder = useMemo(() => [...railCols, ...orderedNonRail], [railCols, orderedNonRail]);
  const colByKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);

  const { getColWidth, startResize } = useColumnResize(table, widthDefaults);
  const hiddenSet = useMemo(() => new Set(hiddenCols), [hiddenCols]);
  const { getStickyLeft } = useStickyOffsets(headerRowRef, frozenCol, hiddenSet, {}, {
    colOrder: fullOrder,
    railWidths: { [CHECKBOX_COL]: CHECKBOX_WIDTH },
    getColWidth,
  });

  const isHidden = useCallback((k: string) => hiddenSet.has(k), [hiddenSet]);
  const isFrozen = useCallback(
    (k: string) => {
      if (railCols.includes(k)) return true;
      if (!frozenCol) return false;
      const i = fullOrder.indexOf(k);
      const j = fullOrder.indexOf(frozenCol);
      return i !== -1 && j !== -1 && i <= j;
    },
    [railCols, frozenCol, fullOrder],
  );
  const handleFreeze = useCallback(
    (k: string) => setFrozenCol(frozenCol === k ? null : k),
    [frozenCol, setFrozenCol],
  );
  const handleSetSort = useCallback(
    (next: { sortBy: string; sortOrder: SortDir }) =>
      setSort(next.sortBy ? `${next.sortBy}:${next.sortOrder}` : null),
    [setSort],
  );

  // ── Column drag-reorder (with freeze-crossing confirm) ──
  const confirmDialog = useConfirm();
  const handleColDrop = useCallback(
    async (fromKey: string, toKey: string, side: "before" | "after") => {
      const nextNonRail = moveByKey(orderedNonRail, fromKey, toKey, side);
      const nextFull = [...railCols, ...nextNonRail];
      const curFull = [...railCols, ...orderedNonRail];
      const unfrozen = columnsUnfrozenBy(curFull, nextFull, frozenCol, railCols);
      const frozen = columnsFrozenBy(curFull, nextFull, frozenCol, railCols);
      if (!(await confirmFreezeChange(confirmDialog, unfrozen, frozen))) return;
      applyOrder(nextNonRail);
    },
    [orderedNonRail, railCols, frozenCol, applyOrder, confirmDialog],
  );
  const colDnd = useColumnDnD({
    getHeaderRow: () => headerRowRef.current,
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

  // ── Row drag-reorder ──
  const orderedIds = useMemo(() => rows.map(getRowId), [rows, getRowId]);
  const rowDnd = useRowDnD({
    getRowsContainer: () => tbodyRef.current,
    getScrollContainer: () => scrollRef.current,
    canDrag: () => rowReorderEnabled && !!onReorderRow,
    onDrop: (fromId, toId, side) => {
      const nb = rowNeighbors(orderedIds, fromId, toId, side);
      if (nb && onReorderRow) onReorderRow({ id: fromId, beforeId: nb.beforeId, afterId: nb.afterId });
    },
  });

  const freezeStyle = useCallback(
    (k: string): React.CSSProperties => {
      const w = getColWidth(k);
      return isFrozen(k) ? { width: w, minWidth: w, left: getStickyLeft(k) } : { width: w };
    },
    [getColWidth, isFrozen, getStickyLeft],
  );
  const tdFreezeClass = useCallback((k: string) => (isFrozen(k) ? "sticky z-[10] bg-white" : ""), [isFrozen]);

  const visibleCols = orderedNonRail.filter((k) => !isHidden(k));
  const colCount = (selectable ? 1 : 0) + visibleCols.length;
  const alignClass = (a?: "left" | "right" | "center") =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className="flex flex-col min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr ref={headerRowRef} className="bg-accent-50 border-b border-gray-200">
              {selectable && (
                <th
                  data-col-key={CHECKBOX_COL}
                  style={{ width: CHECKBOX_WIDTH, left: 0 }}
                  className="sticky z-[35] bg-accent-50 px-3 py-3 text-left"
                >
                  <input
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={rows.length > 0 && !!selected && rows.every((r) => selected.has(getRowId(r)))}
                    disabled={selectionDisabled}
                    onChange={() => {
                      if (selectionDisabled) return onSelectionBlocked?.();
                      onToggleAll?.();
                    }}
                    className={`w-4 h-4 rounded border-gray-300 accent-blue-600 ${
                      selectionDisabled ? "opacity-40 cursor-not-allowed" : ""
                    }`}
                  />
                </th>
              )}
              {orderedNonRail.map((k) => {
                const col = colByKey.get(k);
                if (!col || isHidden(k)) return null;
                const frozen = isFrozen(k);
                const boundary = k === frozenCol;
                const effSortKey = col.sortKey ?? k;
                const isSorted = !!col.sortable && sortBy === effSortKey;
                const width = getColWidth(k);
                return (
                  <th
                    key={k}
                    data-col-key={k}
                    style={frozen ? { left: getStickyLeft(k), width, minWidth: width } : { width }}
                    className={[
                      "group relative px-3 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap",
                      frozen
                        ? `sticky z-[35] bg-accent-50${boundary ? " shadow-[2px_0_4px_rgba(0,0,0,0.06)]" : ""}`
                        : "",
                      dropIndicatorClass(k),
                      colDnd.draggingKey === k ? "opacity-40" : "",
                    ].join(" ").trim()}
                  >
                    <div className="flex items-center gap-1">
                      <DragHandle onStart={(e) => colDnd.startDrag(k, e)} />
                      {boundary && <FreezeIcon />}
                      <span
                        className="flex-1 truncate min-w-0 cursor-grab active:cursor-grabbing touch-none"
                        title={col.label}
                        onPointerDown={(e) => colDnd.startDrag(k, e)}
                      >
                        {col.label}
                        {isSorted && (sortOrder === "asc" ? " ↑" : " ↓")}
                      </span>
                      <ColMenu
                        colKey={k}
                        onSort={col.sortable ? (d) => handleSetSort({ sortBy: effSortKey, sortOrder: d }) : undefined}
                        activeSort={isSorted ? sortOrder : null}
                        onClearSort={col.sortable ? () => handleSetSort({ sortBy: "", sortOrder: "desc" }) : undefined}
                        onFreeze={() => handleFreeze(k)}
                        onHide={() => hideCol(k)}
                        frozen={boundary}
                        showSort={!!col.sortable}
                      />
                    </div>
                    <ResizeHandle onStart={(e) => startResize(k, e.clientX)} />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {loading && (
              <tr>
                <td colSpan={colCount} className="px-4 py-12 text-center text-sm text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-12 text-center text-sm text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((row) => {
                const id = getRowId(row);
                const isChecked = !!selected?.has(id);
                const dragging = rowDnd.draggingId === id;
                const over = rowDnd.overId === id;
                const canDragRow = rowReorderEnabled && !!onReorderRow;
                return (
                  <tr
                    key={id}
                    data-row-id={id}
                    data-row-label={getRowLabel ? getRowLabel(row) : undefined}
                    onPointerDown={canDragRow ? (e) => rowDnd.startDrag(id, e) : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={[
                      "border-b border-gray-100 hover:bg-blue-50/40 transition-colors",
                      onRowClick ? "cursor-pointer" : "",
                      isChecked ? "bg-accent-50" : "",
                      dragging ? "opacity-40" : "",
                      over && rowDnd.dropSide === "before" ? "shadow-[inset_0_2px_0_0_var(--tw-shadow-color)] shadow-blue-500" : "",
                      over && rowDnd.dropSide === "after" ? "shadow-[inset_0_-2px_0_0_var(--tw-shadow-color)] shadow-blue-500" : "",
                    ].join(" ").trim()}
                  >
                    {selectable && (
                      <td
                        data-col-key={CHECKBOX_COL}
                        style={{ width: CHECKBOX_WIDTH, left: 0 }}
                        className="sticky z-[10] bg-white px-3 py-3"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selectionDisabled) return onSelectionBlocked?.();
                          onToggleRow?.(id);
                        }}
                      >
                        {/* The <td> onClick is the single toggle handler (it also
                            gives a larger hit target). The input's onChange is a
                            no-op so a click on the box itself doesn't fire a
                            SECOND toggle that cancels the first out. */}
                        <input
                          type="checkbox"
                          aria-label="Select row"
                          checked={isChecked}
                          disabled={selectionDisabled}
                          readOnly
                          onChange={() => {}}
                          className={`w-4 h-4 rounded border-gray-300 accent-blue-600 pointer-events-none ${
                            selectionDisabled ? "opacity-40 cursor-not-allowed" : ""
                          }`}
                        />
                      </td>
                    )}
                    {orderedNonRail.map((k) => {
                      const col = colByKey.get(k);
                      if (!col || isHidden(k)) return null;
                      return (
                        <td
                          key={k}
                          data-col-key={k}
                          style={freezeStyle(k)}
                          className={`px-4 py-3 text-gray-700 overflow-hidden ${alignClass(col.align)} ${tdFreezeClass(k)}`}
                        >
                          {col.render(row)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {page != null && limit != null && total != null && onPageChange && (
        <Pagination
          page={page}
          totalPages={totalPages ?? 1}
          total={total}
          limit={limit}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
      {rowDnd.dragGhost}
    </div>
  );
}
