"use client";

import { useState, useRef, useEffect, useMemo, useCallback, type UIEvent } from "react";
import type { KPIRow, WeeklyValue } from "@/lib/types/kpi";
import { weeksArray, weekDateLabel } from "@/lib/utils/fiscal";
import { progressColor, weekCellColors, fmt, formatScaledKpiValue, getProgressBadgeColors, getLatestWeeklyNote, type NumberFormat } from "@/lib/utils/kpiHelpers";
import { getColorByPercentage } from "@/lib/utils/colorLogic";
import { UserAuditCell, DateAuditCell } from "@/components/table/AuditCells";
import { computeQtd, weeklyGoalFor } from "./kpiStats";
import { useTableColumns, COL_LABELS, SORT_KEYS } from "../hooks/useTableColumns";
import { useStickyOffsets } from "@/lib/hooks/useStickyOffsets";
import { FreezeIcon } from "@/components/ui/FreezeIcon";
import { HorizontalScroller } from "@/components/ui/HorizontalScroller";
import { isNearBottom } from "@/lib/utils/scroll";
import { ResizeHandle as SharedResizeHandle } from "@/lib/hooks/useColumnResize";
import { useCurrentWeek, useQtdReferenceWeek, useWeekLabels, useQuarterWeekCount } from "@/lib/hooks/useCurrentWeek";
import { usePastWeekFlags } from "@/lib/hooks/useFeatureFlags";
import { LogModal } from "./LogModal";
import { ChangeHistoryPanel } from "./ChangeHistoryPanel";
import { HistoryButton } from "@/components/audit/HistoryButton";
import { WeekTooltip } from "./WeekTooltip";
import { DescTooltip } from "./DescTooltip";
import { NameTooltip } from "./NameTooltip";
import { ColMenu } from "@/components/table/ColMenu";
import { SortIndicator } from "@/components/table/SortIndicator";
import { X } from "lucide-react";
import { Pagination, useConfirm } from "@quikit/ui";
import { notify } from "@/lib/utils/notify";
import { useColumnDnD, DragHandle } from "@/lib/hooks/useColumnDnD";
import { confirmFreezeChange } from "@/lib/utils/freezeConfirm";
import { useRowDnD } from "@/lib/hooks/useRowDnD";
import { rowNeighbors } from "@/lib/utils/rowOrder";
export { HiddenColsMenu } from "./HiddenColsMenu";

// ── Resize handle ────────────────────────────────────────────────────────────

// Use the shared ResizeHandle from @/lib/hooks/useColumnResize — same handle
// used by Priority and WWW tables. Imported as SharedResizeHandle and aliased
// below for call-site readability.
const ResizeHandle = SharedResizeHandle;

// ── Main table ───────────────────────────────────────────────────────────────

interface Props {
  kpis: KPIRow[];
  // Pagination props are optional: when any is omitted the internal Paginator
  // is hidden (used by the dashboard's infinite-scroll shell, which renders ALL
  // accumulated rows itself). Mirrors PriorityTable/WWWTable's paginationEnabled
  // gate. Cell styling is unchanged.
  total?: number;
  page?: number;
  pageSize?: number;
  year: number;
  quarter: string;
  onPageChange?: (p: number) => void;
  onPageSizeChange?: (size: number) => void;
  onSort: (col: string, dir: "asc" | "desc") => void;
  /** Reset sorting to the default (newest-first) order. Wired to the ColMenu's
   *  "Clear sort" row / active-direction toggle. Callers implement this by
   *  setting the backend sort key back to "" (no sort params sent → server
   *  default order). Optional so read-only embeds can omit it. */
  onClearSort?: () => void;
  onRefresh: () => void;
  onSelectionChange?: (ids: Set<string>) => void;
  clearSelectionTrigger?: number;
  onHiddenColsChange?: (cols: Set<string>) => void;
  showColTrigger?: { col: string; seq: number };
  /** Columns to always hide on this instance (e.g. dashboard preview).
   *  Does NOT persist — only affects this render. */
  hideColumns?: string[];
  /** Limit the number of rows displayed (for dashboard previews). */
  maxRows?: number;
  /** When true, all interactive affordances (selection, edit, log, weekly cell input) are suppressed. */
  readOnly?: boolean;
  /** When true, the table stretches to 100% of its container instead of using
   *  `min-width: max-content`. Use this in dashboard previews where the
   *  number of week columns is small and we want to fill the available
   *  horizontal space rather than leaving empty space on the right. */
  fillWidth?: boolean;
  /** RBAC v2: false hides bulk-delete checkbox interaction and toasts a
   *  warning when the user attempts to click. Defaults to true. */
  canDelete?: boolean;
  /** RBAC v2: false makes opened edit drawers read-only. Pass-through to
   *  KPIDrawer so it can compose with instance-level rules. Defaults to true. */
  canUpdate?: boolean;
  /** Current server-side sort — when provided, the matching header shows an
   *  up/down arrow next to its label. Values are the BACKEND keys (e.g.
   *  "name", "owner", "progressPercent"), i.e. SORT_KEYS[col]. */
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  /** Infinite-scroll mode (dashboard). When `maxBodyHeight` is set the table
   *  body becomes a fixed-height vertical scroll area (sticky header pins, both
   *  scrollbars stay inside the card) and `onLoadMore` fires near the bottom.
   *  Omitted on module pages → classic paginated behavior, unchanged. */
  maxBodyHeight?: number;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
  /** Number display format for the value cells. "indian" → lakh/crore/arab;
   *  default "standard" → K/M/B. Only the dashboard passes "indian"; module
   *  pages omit it and stay unchanged. Affects number text only (no styling). */
  numberFormat?: NumberFormat;
}

export function KPITable({ kpis: kpisAll, total, page, pageSize, year, quarter, onPageChange, onPageSizeChange, onSort, onClearSort, onRefresh, onSelectionChange, clearSelectionTrigger, onHiddenColsChange, showColTrigger, hideColumns, maxRows, readOnly, fillWidth, canDelete = true, canUpdate = true, sortBy, sortOrder, maxBodyHeight, hasMore, isFetchingMore, onLoadMore, numberFormat = "standard" }: Props) {
  const kpis = maxRows != null ? kpisAll.slice(0, maxRows) : kpisAll;
  // Goal/value formatter. For a Currency KPI with a chosen scale it renders the
  // currency + scaled unit (₹4 Cr / $9 M); otherwise it's the plain compact
  // number honoring the caller's format (Indian on dashboard, standard else).
  // Number text only — no styling change.
  const fmtN = (kpi: KPIRow, v: number | null | undefined) =>
    formatScaledKpiValue(v, {
      measurementUnit: kpi.measurementUnit,
      currency: kpi.currency,
      targetScale: kpi.targetScale,
      scaledDisplay: kpi.scaledDisplay,
      unit: kpi.unit,
      numberFormat,
    });
  // Infinite-scroll mode: bounded-height body whose vertical scroll loads more.
  const infiniteMode = maxBodyHeight != null;
  const handleBodyScroll = (e: UIEvent<HTMLDivElement>) => {
    if (!infiniteMode || !hasMore || isFetchingMore) return;
    if (isNearBottom(e.currentTarget)) onLoadMore?.();
  };
  // Pagination is enabled only when the caller wires up all of page/pageSize/
  // total/onPageChange (module pages). The dashboard omits them → infinite mode.
  const paginationEnabled = page != null && pageSize != null && total != null && onPageChange != null;
  // Defaults so row numbering + slicing math stay valid in infinite mode
  // (page 1, all loaded rows on one logical page).
  const effPage = page ?? 1;
  const effPageSize = pageSize ?? (kpisAll.length || 1);
  const weekCount = useQuarterWeekCount(year, quarter);
  const weekCols = useMemo(() => weeksArray(weekCount).map(w => `week${w}`), [weekCount]);
  const headerRowRef = useRef<HTMLTableRowElement>(null);
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const [logKPI, setLogKPI] = useState<KPIRow | null>(null);
  const [logInitialTab, setLogInitialTab] = useState<"updates" | "edit" | "stats">("updates");
  const [auditKPI, setAuditKPI] = useState<KPIRow | null>(null);

  // Blocked-week detection: past weeks with no value show a red ✕
  const currentWeek = useCurrentWeek(year, quarter);
  // QTD reference week — past/current/future aware (a fully-past quarter counts
  // all its weeks in QTD, not weekCount-1). Feeds the QTD Goal / QTD Achieved
  // columns; display logic keeps using `currentWeek`. See `qtdReferenceWeek`.
  const qtdWeek = useQtdReferenceWeek(year, quarter);
  // DB-driven week labels (compact "22–28 Apr") indexed [week-1].
  // Falls back to legacy hardcoded labels while loading.
  const weekLabels = useWeekLabels(year, quarter);
  const { canAddPastWeek } = usePastWeekFlags();

  function openLog(kpi: KPIRow) { if (readOnly) return; setAuditKPI(kpi); }
  function openEdit(kpi: KPIRow) { if (readOnly) return; setLogKPI(kpi); setLogInitialTab("edit"); }

  const {
    colWidths, frozenUpTo, hiddenCols, selectedIds,
    getColWidth, isFrozen, startResize,
    handleFreezeCol, handleHideCol, handleShowCol,
    toggleSelect, toggleAll, clearSelection,
    orderedStaticCols, computeStaticReorder, applyStaticOrder,
  } = useTableColumns(weekCols, kpis.map(k => k.id));

  const { getStickyLeft } = useStickyOffsets(headerRowRef, frozenUpTo, hiddenCols, colWidths);

  // ── Drag-to-reorder columns ─────────────────────────────────────────────
  // Rail columns (checkbox/log/id) and week columns are not reorderable. When a
  // drop would move a currently-frozen column past the freeze boundary (i.e.
  // unfreeze it), confirm before committing — otherwise apply immediately.
  const confirm = useConfirm();
  // Reordering persists to the shared "kpi" preference row, so it's only
  // enabled on the full module page. Dashboard/embedded previews opt out via
  // their layout flags (readOnly / fillWidth / maxRows / maxBodyHeight) so a
  // preview can't silently rewrite the user's saved order. NOTE: `hideColumns`
  // is NOT a preview signal — the real module page uses it to default-hide
  // togglable columns, so it must not gate reordering.
  const reorderDisabled = !!readOnly || !!fillWidth || maxRows != null || maxBodyHeight != null;
  const canReorderCol = useCallback(
    (col: string) => !reorderDisabled && orderedStaticCols.includes(col),
    [reorderDisabled, orderedStaticCols],
  );
  const handleColDrop = useCallback(
    async (fromKey: string, toKey: string, side: "before" | "after") => {
      const { nextStatic, unfrozen, frozen } = computeStaticReorder(fromKey, toKey, side);
      if (!(await confirmFreezeChange(confirm, unfrozen, frozen))) return;
      applyStaticOrder(nextStatic);
    },
    [computeStaticReorder, applyStaticOrder, confirm],
  );
  const dnd = useColumnDnD({
    getHeaderRow: () => headerRowRef.current,
    onDrop: handleColDrop,
    canReorder: canReorderCol,
  });

  // ── Drag-to-reorder ROWS (org-shared manual order) ───────────────────────
  // Enabled only in manual mode (no active column sort) and never in previews.
  const rowReorderEnabled = !reorderDisabled && !sortBy;
  const orderedRowIds = useMemo(() => kpis.map(k => k.id), [kpis]);
  const handleRowDrop = useCallback(
    async (fromId: string, toId: string, side: "before" | "after") => {
      const n = rowNeighbors(orderedRowIds, fromId, toId, side);
      if (!n) return;
      try {
        const res = await fetch("/api/kpi/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: fromId, beforeId: n.beforeId, afterId: n.afterId }),
        });
        if (!res.ok) throw new Error("reorder failed");
        onRefresh();
      } catch {
        notify.error("Failed to reorder row");
        onRefresh();
      }
    },
    [orderedRowIds, onRefresh],
  );
  const rowDnd = useRowDnD({
    getRowsContainer: () => tbodyRef.current,
    onDrop: handleRowDrop,
    canDrag: () => rowReorderEnabled,
  });
  function rowDropClass(id: string) {
    if (rowDnd.overId !== id || !rowDnd.dropSide) return "";
    return rowDnd.dropSide === "before"
      ? "shadow-[inset_0_2px_0_0_var(--tw-shadow-color)] shadow-blue-500"
      : "shadow-[inset_0_-2px_0_0_var(--tw-shadow-color)] shadow-blue-500";
  }

  // Notify parent when selection changes
  useEffect(() => { onSelectionChange?.(selectedIds); }, [selectedIds, onSelectionChange]);

  // Clear selection when parent requests it
  useEffect(() => { if (clearSelectionTrigger) clearSelection(); }, [clearSelectionTrigger, clearSelection]);

  // Notify parent when hidden cols change
  useEffect(() => { onHiddenColsChange?.(hiddenCols); }, [hiddenCols, onHiddenColsChange]);

  // Show col when parent requests it
  useEffect(() => { if (showColTrigger) handleShowCol(showColTrigger.col); }, [showColTrigger, handleShowCol]);

  // Local hide set = persisted hidden cols + this instance's hideColumns prop (not persisted)
  const localHideSet = useMemo(() => {
    const s = new Set<string>(hiddenCols);
    (hideColumns ?? []).forEach((c) => s.add(c));
    return s;
  }, [hiddenCols, hideColumns]);

  const hideCheckbox = localHideSet.has("_checkbox");
  const hideLog = localHideSet.has("_log");
  const hideId = localHideSet.has("_id");

  const totalPages = Math.ceil((total ?? kpisAll.length) / effPageSize);
  const visibleStaticCols = orderedStaticCols.filter(c => !localHideSet.has(c));
  const visibleWeekCols = weeksArray(weekCount).filter(w => !localHideSet.has(`week${w}`));

  // Tailwind classes for the live drop indicator on the header cell currently
  // under the drag pointer (left/right edge line).
  function dropIndicatorClass(col: string) {
    if (dnd.overKey !== col || !dnd.dropSide) return "";
    return dnd.dropSide === "before"
      ? "shadow-[inset_2px_0_0_0_var(--tw-shadow-color)] shadow-blue-500"
      : "shadow-[inset_-2px_0_0_0_var(--tw-shadow-color)] shadow-blue-500";
  }

  // Per-row derived data hoisted out of the render .map. Previously this heavy
  // compute (Standalone QTD re-derive, weekMap build, badge colors) re-ran for
  // EVERY visible row on ANY table state change (modal open, selection, column
  // resize). Computing it once per (kpis, currentWeek) is byte-identical output
  // — just not recomputed on unrelated re-renders. Keyed by kpi.id.
  const rowDerived = useMemo(() => {
    const map = new Map<string, {
      progressDivisionType: "Cumulative" | "Standalone";
      progressPct: number;
      ownerName: string | null;
      weekMap: Record<number, WeeklyValue>;
      progressBarBg: string;
      progressTextColor: string;
    }>();
    for (const kpi of kpis) {
      const progressDivisionType: "Cumulative" | "Standalone" =
        kpi.divisionType === "Standalone" ? "Standalone" : "Cumulative";
      const stdProgress =
        progressDivisionType === "Standalone"
          ? computeQtd(kpi, qtdWeek, "Standalone", weekCount)
          : null;
      const progressAchieved =
        stdProgress != null ? (stdProgress.qtdAchieved ?? 0) : (kpi.qtdAchieved ?? 0);
      const progressGoal =
        stdProgress != null
          ? (stdProgress.qtdGoal ?? kpi.target ?? 0)
          : (kpi.qtdGoal ?? kpi.target ?? 0);
      const progressPct = progressGoal > 0 ? (progressAchieved / progressGoal) * 100 : 0;
      const ownerName = kpi.owner_user ? `${kpi.owner_user.firstName} ${kpi.owner_user.lastName}` : kpi.owner;
      const weekMap: Record<number, WeeklyValue> = {};
      (kpi.weeklyValues ?? []).forEach(wv => { weekMap[wv.weekNumber] = wv; });
      const hasAnyWeeklyValue = Object.values(weekMap).some((wv) => wv?.value != null);
      const progressBadge = kpi.qtdAchieved != null
        ? getProgressBadgeColors(progressAchieved, progressGoal, hasAnyWeeklyValue, kpi.reverseColor ?? false)
        : { bar: "bg-gray-300", text: "text-gray-500", label: "—" };
      map.set(kpi.id, {
        progressDivisionType,
        progressPct,
        ownerName,
        weekMap,
        progressBarBg: progressBadge.bar,
        progressTextColor: progressBadge.text,
      });
    }
    return map;
  }, [kpis, qtdWeek, weekCount]);

  function thClass(col: string) {
    const sticky = isFrozen(col);
    const boundary = col === frozenUpTo;
    return [
      // `relative` is required so the absolutely-positioned ResizeHandle
      // anchors to the <th> itself (otherwise handle's h-full collapses
      // inside an auto-height table cell and has zero hit area).
      "group relative text-left text-xs font-semibold text-gray-500 bg-accent-50",
      "border-b border-r border-gray-200 select-none",
      sticky ? `sticky z-[35]${boundary ? " shadow-[2px_0_4px_rgba(0,0,0,0.06)]" : ""}` : "",
    ].join(" ");
  }

  function tdClass(col: string, extra = "") {
    const sticky = isFrozen(col);
    const boundary = col === frozenUpTo;
    return [
      // `overflow-hidden` needed so wide content doesn't blow past the column
      // width set by `table-layout: fixed`. Individual cells that need wrap
      // (e.g. kpiName) handle their own `line-clamp-N` on the inner span.
      "px-3 py-2 text-xs text-gray-700 border-b border-r border-gray-100 overflow-hidden align-top",
      extra,
      sticky ? `sticky z-[15] bg-white${boundary ? " shadow-[2px_0_4px_rgba(0,0,0,0.04)]" : ""}` : "",
    ].join(" ");
  }

  function stickyStyle(col: string, w: number) {
    return isFrozen(col) ? { left: getStickyLeft(col), width: w } : { width: w };
  }

  return (
    <div className="flex flex-col h-full">

      <HorizontalScroller
        className="flex-1"
        innerStyle={infiniteMode ? { maxHeight: maxBodyHeight } : undefined}
        showVerticalScrollbar={infiniteMode}
        onContentScroll={infiniteMode ? handleBodyScroll : undefined}
      >
        <table
          className={`border-separate border-spacing-0 text-xs ${fillWidth ? "w-full" : ""}`}
          style={fillWidth
            ? { width: "100%", tableLayout: "fixed" }
            : { minWidth: "max-content", tableLayout: "fixed" }}>
          <thead className="sticky top-0 z-30">
            <tr ref={headerRowRef}>
              {/* Fixed columns: Checkbox, Log, ID (hidable via hideColumns prop) */}
              {!hideCheckbox && (
                <th data-col-key="_checkbox" className="sticky z-[35] px-2 py-2 bg-accent-50 border-b border-r border-gray-200"
                  style={{ left: 0, width: 40, minWidth: 40, maxWidth: 40 }}>
                  <label
                    onClickCapture={(e) => {
                      if (!canDelete) {
                        e.preventDefault();
                        e.stopPropagation();
                        notify.error("You don't have permission to delete");
                      }
                    }}
                  >
                    <input type="checkbox" checked={selectedIds.size === kpis.length && kpis.length > 0}
                      onChange={toggleAll} disabled={!canDelete}
                      className={`rounded border-gray-300 text-blue-600 ${!canDelete ? "opacity-40 cursor-not-allowed" : ""}`} />
                  </label>
                </th>
              )}
              {!hideLog && (
                <th data-col-key="_log" className="sticky z-[35] px-1 py-2 bg-accent-50 border-b border-r border-gray-200 text-xs font-semibold text-gray-500 text-center overflow-hidden"
                  style={{ left: hideCheckbox ? 0 : 40, width: 40, minWidth: 40, maxWidth: 40 }}>Log</th>
              )}
              {!hideId && (
                <th data-col-key="_id" className="sticky z-[35] px-1 py-2 bg-accent-50 border-b border-r border-gray-200 text-xs font-semibold text-gray-500 text-center overflow-hidden"
                  style={{ left: (hideCheckbox ? 0 : 40) + (hideLog ? 0 : 40), width: 40, minWidth: 40, maxWidth: 40 }}>ID</th>
              )}

              {/* Dynamic static columns */}
              {visibleStaticCols.map(col => {
                const w = getColWidth(col);
                const sortable = !!SORT_KEYS[col];
                const isSorted = sortable && sortBy === SORT_KEYS[col];
                const isDragging = dnd.draggingKey === col;
                return (
                  <th key={col} data-col-key={col}
                    className={`${thClass(col)} ${dropIndicatorClass(col)} ${isDragging ? "opacity-40" : ""}`}
                    style={stickyStyle(col, w)}>
                    <div className="flex items-center gap-1 px-3 py-2 pr-2">
                      {frozenUpTo === col && <FreezeIcon />}
                      {!reorderDisabled && <DragHandle onStart={(e) => dnd.startDrag(col, e)} />}
                      {/* `title` surfaces the full label as a native tooltip when
                          the column is narrow enough to ellipsize (common on
                          Dashboard previews where cells are constrained).
                          The label itself is a drag handle — grabbing the column
                          title reorders (matches user expectation). */}
                      <span
                        title={COL_LABELS[col]}
                        onPointerDown={reorderDisabled ? undefined : (e) => dnd.startDrag(col, e)}
                        className={`flex-1 truncate min-w-0 ${isSorted ? "text-accent-700" : ""} ${reorderDisabled ? "" : "cursor-grab active:cursor-grabbing touch-none"}`}
                      >
                        {COL_LABELS[col]}
                      </span>
                      <SortIndicator active={isSorted} direction={sortOrder} />
                      <ColMenu colKey={col}
                        onSort={sortable ? (d => onSort(SORT_KEYS[col], d)) : undefined}
                        activeSort={isSorted ? (sortOrder ?? null) : null}
                        onClearSort={sortable && onClearSort ? onClearSort : undefined}
                        onFreeze={() => handleFreezeCol(col)} onHide={() => handleHideCol(col)}
                        frozen={frozenUpTo === col}
                        showSort={sortable} />
                    </div>
                    <ResizeHandle onStart={(e) => startResize(col, e.clientX)} />
                  </th>
                );
              })}

              {/* Week columns */}
              {visibleWeekCols.map(w => {
                const col = `week${w}`;
                const colW = getColWidth(col);
                return (
                  <th key={w} data-col-key={col}
                    className={thClass(col)}
                    style={stickyStyle(col, colW)}>
                    <div className="flex items-start gap-1 px-3 py-2 pr-2">
                      {frozenUpTo === col && <FreezeIcon className="mt-0.5" />}
                      <div className="min-w-0 flex-1">
                        <div className="whitespace-nowrap">
                          Week {w}
                        </div>
                        <div className="text-[9px] font-normal text-gray-400 leading-none mt-0.5 whitespace-nowrap">
                          {weekLabels[w - 1] ?? weekDateLabel(year, quarter, w)}
                        </div>
                      </div>
                      <ColMenu colKey={col} onSort={() => {}} onFreeze={() => handleFreezeCol(col)} onHide={() => handleHideCol(col)}
                        frozen={frozenUpTo === col} showSort={false} />
                    </div>
                    <ResizeHandle onStart={(e) => startResize(col, e.clientX)} />
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody ref={tbodyRef}>
            {kpis.length === 0 ? (
              <tr>
                <td colSpan={3 + visibleStaticCols.length + visibleWeekCols.length}
                  className="px-6 py-12 text-center text-gray-400">
                  No KPIs found. Click <strong>Add KPI</strong> to create one.
                </td>
              </tr>
            ) : kpis.map((kpi, idx) => {
              // Progress column uses `getProgressBadgeColors` (NOT
              // `getColorByPercentage` directly) because the percentage
              // text sits on a white row — the underlying helper's
              // `text-white` tone is for cells with a colored bg and
              // would render the label invisible here. The badge helper
              // returns the same color thresholds with readable-on-white
              // text tones (text-blue-700 etc.).
              //
              // Standalone KPIs: server-stamped `kpi.qtdAchieved` is a
              // cumulative SUM regardless of divisionType, so it shows
              // (e.g.) 341% on a Standalone KPI whose true progress is
              // ~113%. Re-derive via `computeQtd(...,"Standalone")` —
              // that returns avg / kpi.target per the spec. Cumulative
              // path stays byte-identical to before.
              // Precomputed once in `rowDerived` (see above) — output identical,
              // just not recomputed for every row on unrelated re-renders.
              const { progressDivisionType, progressPct, ownerName, weekMap, progressBarBg, progressTextColor } =
                rowDerived.get(kpi.id)!;

              // Render a single static column cell by key. Driven by the
              // user's drag order (`visibleStaticCols`) so header and body
              // stay in lockstep. Cell styling/colors are byte-identical to the
              // previous hardcoded blocks — only the render order is dynamic.
              // Note: qtdGoal / qtdAchieved now render independently (each
              // recomputes QTD) so they can be reordered separately; output is
              // unchanged from the old coupled block.
              const renderStatic = (col: string) => {
                switch (col) {
                  case "progress":
                    return (
                      <td key={col} className={tdClass("progress")} style={stickyStyle("progress", getColWidth("progress"))}>
                        <div className="flex items-center gap-2">
                          <span className={`font-medium w-10 flex-shrink-0 ${progressTextColor}`}>{progressPct.toFixed(0)}%</span>
                          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden min-w-[40px]">
                            <div className={`h-2 rounded-full transition-all ${progressBarBg}`} style={{ width: `${Math.min(progressPct, 100)}%` }} />
                          </div>
                        </div>
                      </td>
                    );
                  case "owner":
                    return (
                      <td key={col} className={tdClass("owner", "whitespace-nowrap")} style={stickyStyle("owner", getColWidth("owner"))}>{ownerName}</td>
                    );
                  case "kpiName":
                    return (
                      <td key={col} className={tdClass("kpiName")} style={stickyStyle("kpiName", getColWidth("kpiName"))}>
                        <NameTooltip name={kpi.name}>
                          <div
                            className="max-h-[3.25rem] overflow-y-auto leading-snug break-all cursor-default pr-1"
                            style={{ scrollbarWidth: "thin" }}
                          >
                            {kpi.name}
                            {kpi.parentKPI && (
                              <span
                                title={`Linked to Team KPI: ${kpi.parentKPI.name}`}
                                className="ml-1 inline-block px-1.5 py-px text-[9px] font-semibold rounded bg-gray-100 text-gray-600 align-middle"
                              >
                                Linked
                              </span>
                            )}
                          </div>
                        </NameTooltip>
                      </td>
                    );
                  case "team":
                    return (
                      <td key={col} className={tdClass("team", "whitespace-nowrap")} style={stickyStyle("team", getColWidth("team"))}>
                        {kpi.team?.name ? (
                          <span className="text-gray-700 truncate block">{kpi.team.name}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    );
                  case "teamHead":
                    return (
                      <td key={col} className={tdClass("teamHead", "whitespace-nowrap")} style={stickyStyle("teamHead", getColWidth("teamHead"))}>
                        {kpi.team?.head ? (
                          <span className="text-gray-700 truncate block">
                            {kpi.team.head.firstName} {kpi.team.head.lastName}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    );
                  case "kpiOwner":
                    return (
                      <td key={col} className={tdClass("kpiOwner")} style={stickyStyle("kpiOwner", getColWidth("kpiOwner"))}>
                        {kpi.owners && kpi.owners.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {kpi.owners.slice(0, 3).map(u => {
                              const pct = (kpi.ownerContributions as Record<string, number> | undefined)?.[u.id];
                              return (
                                <div key={u.id} className="text-[11px] text-gray-700 truncate leading-tight">
                                  {u.firstName} {u.lastName}
                                  {typeof pct === "number" && (
                                    <span className="text-gray-400 ml-1">({pct.toFixed(0)}%)</span>
                                  )}
                                </div>
                              );
                            })}
                            {kpi.owners.length > 3 && (
                              <div className="text-[10px] text-gray-400">+{kpi.owners.length - 3} more</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    );
                  case "measurementUnit":
                    return (
                      <td key={col} className={tdClass("measurementUnit", "whitespace-nowrap")} style={stickyStyle("measurementUnit", getColWidth("measurementUnit"))}>{kpi.measurementUnit}</td>
                    );
                  case "targetValue":
                    return (
                      <td key={col} className={tdClass("targetValue")} style={stickyStyle("targetValue", getColWidth("targetValue"))}>{fmtN(kpi, kpi.target ?? null)}</td>
                    );
                  case "quarterlyGoal":
                    return (
                      <td key={col} className={tdClass("quarterlyGoal")} style={stickyStyle("quarterlyGoal", getColWidth("quarterlyGoal"))}>{fmtN(kpi, kpi.quarterlyGoal ?? null)}</td>
                    );
                  case "qtdGoal": {
                    const { qtdGoal } = computeQtd(kpi, qtdWeek, progressDivisionType, weekCount);
                    return (
                      <td key={col} className={tdClass("qtdGoal")} style={stickyStyle("qtdGoal", getColWidth("qtdGoal"))}>
                        {qtdGoal != null ? fmtN(kpi, qtdGoal) : "—"}
                      </td>
                    );
                  }
                  case "qtdAchieved": {
                    // Same semantic traffic-light palette as the weekly cells
                    // (≥120 blue, ≥100 green, ≥80 yellow, <80+updated red, else
                    // neutral). RED gated on ≥1 weekly value entered.
                    const { qtdGoal, qtdAchieved } = computeQtd(kpi, qtdWeek, progressDivisionType, weekCount);
                    const hasAnyWeeklyValue = Object.values(weekMap).some(wv => wv?.value != null);
                    const color = qtdAchieved != null
                      ? getColorByPercentage(qtdAchieved, qtdGoal ?? kpi.target ?? 0, hasAnyWeeklyValue, kpi.reverseColor ?? false)
                      : null;
                    const sticky = isFrozen("qtdAchieved");
                    const boundary = "qtdAchieved" === frozenUpTo;
                    return (
                      <td key={col}
                        className={[
                          "px-3 py-2 text-xs border-b border-r border-gray-100 overflow-hidden align-top text-center font-semibold",
                          color?.bg || (sticky ? "bg-white" : ""),
                          color?.text ?? "text-gray-700",
                          sticky ? `sticky z-[15]${boundary ? " shadow-[2px_0_4px_rgba(0,0,0,0.04)]" : ""}` : "",
                        ].filter(Boolean).join(" ")}
                        style={stickyStyle("qtdAchieved", getColWidth("qtdAchieved"))}
                      >
                        {qtdAchieved != null ? fmtN(kpi, qtdAchieved) : "—"}
                      </td>
                    );
                  }
                  case "weeklyGoal":
                    return (
                      <td key={col} className={tdClass("weeklyGoal")} style={stickyStyle("weeklyGoal", getColWidth("weeklyGoal"))}>
                        {(() => {
                          const wg = weeklyGoalFor(kpi, currentWeek ?? 1, weekCount);
                          return wg > 0 ? fmtN(kpi, wg) : "—";
                        })()}
                      </td>
                    );
                  case "description":
                    return (
                      <td key={col} className={tdClass("description")} style={stickyStyle("description", getColWidth("description"))}>
                        <DescTooltip description={kpi.description} lastNotes={kpi.lastNotes} lastNotesAt={kpi.lastNotesAt}>
                          <span className="line-clamp-2 text-gray-500 leading-snug cursor-default">
                            {kpi.description ? kpi.description.slice(0, 60) + (kpi.description.length > 60 ? "…" : "") : "—"}
                          </span>
                        </DescTooltip>
                      </td>
                    );
                  case "lastNotes": {
                    const latest = getLatestWeeklyNote(kpi);
                    return (
                      <td key={col} className={tdClass("lastNotes")} style={stickyStyle("lastNotes", getColWidth("lastNotes"))}>
                        {latest ? (
                          <div
                            className="max-h-[3.25rem] overflow-y-auto leading-snug break-all text-gray-500 cursor-default pr-1"
                            style={{ scrollbarWidth: "thin" }}
                            title={latest.note}
                          >
                            {latest.weekNumber != null && (
                              <span className="text-gray-400 mr-1">W{latest.weekNumber}:</span>
                            )}
                            {latest.note}
                          </div>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    );
                  }
                  case "importedFromOpsp":
                    return (
                      <td key={col} className={tdClass("importedFromOpsp")} style={stickyStyle("importedFromOpsp", getColWidth("importedFromOpsp"))}>
                        {kpi.importedFromOpsp ? (
                          <span className="text-gray-700 font-medium">Yes</span>
                        ) : (
                          <span className="text-gray-300">No</span>
                        )}
                      </td>
                    );
                  case "createdBy":
                    return (
                      <td key={col} className={tdClass("createdBy")} style={stickyStyle("createdBy", getColWidth("createdBy"))}>
                        <UserAuditCell name={kpi.createdByName} initials={kpi.createdByInitials} />
                      </td>
                    );
                  case "updatedBy":
                    return (
                      <td key={col} className={tdClass("updatedBy")} style={stickyStyle("updatedBy", getColWidth("updatedBy"))}>
                        <UserAuditCell name={kpi.updatedByName} initials={kpi.updatedByInitials} />
                      </td>
                    );
                  case "createdAt":
                    return (
                      <td key={col} className={tdClass("createdAt")} style={stickyStyle("createdAt", getColWidth("createdAt"))}>
                        <DateAuditCell iso={kpi.createdAt} />
                      </td>
                    );
                  case "updatedAt":
                    return (
                      <td key={col} className={tdClass("updatedAt")} style={stickyStyle("updatedAt", getColWidth("updatedAt"))}>
                        <DateAuditCell iso={kpi.updatedAt} />
                      </td>
                    );
                  default:
                    return null;
                }
              };

              return (
                <tr key={kpi.id} data-row-id={kpi.id} data-row-label={kpi.name}
                  onPointerDown={rowReorderEnabled ? (e) => rowDnd.startDrag(kpi.id, e) : undefined}
                  className={`group hover:bg-blue-50/30 transition-colors ${rowReorderEnabled ? "cursor-grab active:cursor-grabbing" : ""} ${rowDropClass(kpi.id)} ${rowDnd.draggingId === kpi.id ? "opacity-40" : ""}`}>
                  {/* Fixed: Checkbox (hidable) */}
                  {!hideCheckbox && (
                    <td className="sticky z-[15] bg-white px-2 py-2 border-b border-r border-gray-100"
                      style={{ left: 0, width: 40, minWidth: 40, maxWidth: 40 }}>
                      <label
                        onClickCapture={(e) => {
                          if (!canDelete && !readOnly) {
                            e.preventDefault();
                            e.stopPropagation();
                            notify.error("You don't have permission to delete");
                          }
                        }}
                      >
                        <input type="checkbox" checked={selectedIds.has(kpi.id)} disabled={readOnly || !canDelete}
                          onChange={() => { if (!readOnly && canDelete) toggleSelect(kpi.id); }}
                          className={`rounded border-gray-300 text-blue-600 ${readOnly || !canDelete ? "opacity-40 cursor-not-allowed" : ""}`} />
                      </label>
                    </td>
                  )}
                  {/* Fixed: Log (hidable) */}
                  {!hideLog && (
                    <td className="sticky z-[15] bg-white px-1 py-2 border-b border-r border-gray-100 text-center"
                      style={{ left: hideCheckbox ? 0 : 40, width: 40, minWidth: 40, maxWidth: 40 }}>
                      <HistoryButton entityId={kpi.id} onClick={() => openLog(kpi)} disabled={readOnly} />
                    </td>
                  )}
                  {/* Fixed: ID (hidable) */}
                  {!hideId && (
                    <td className="sticky z-[15] bg-white px-1 py-2 border-b border-r border-gray-100 text-center"
                      style={{ left: (hideCheckbox ? 0 : 40) + (hideLog ? 0 : 40), width: 40, minWidth: 40, maxWidth: 40 }}>
                      <button onClick={() => openEdit(kpi)} disabled={readOnly}
                        className={`font-medium ${readOnly ? "text-gray-400 cursor-not-allowed" : "text-gray-900 hover:underline"}`}>
                        {idx + 1 + (effPage - 1) * effPageSize}
                      </button>
                    </td>
                  )}

                  {/* Static columns — rendered in the user's drag-and-drop
                      order. Each cell's styling/colors are unchanged from the
                      previous hardcoded blocks (see `renderStatic`). */}
                  {visibleStaticCols.map(renderStatic)}

                  {/* Week columns */}
                  {visibleWeekCols.map(w => {
                    const col = `week${w}`;
                    const wv = weekMap[w];
                    const val = wv?.value;
                    const note = wv?.notes;
                    // Per-week target wins over `qtdGoal/13` averaging.
                    // `weekCellColors` divides by 13 internally, so the
                    // explicit per-week target is multiplied back to keep
                    // the helper signature unchanged. Mirrors the
                    // Dashboard's pattern at dashboard/page.tsx:648.
                    // Without this, KPIs whose per-week target differs
                    // from `qtdGoal/13` (or whose qtdGoal isn't the
                    // quarterly sum) paint the wrong color band.
                    const kpiWeeklyTargets = kpi.weeklyTargets as Record<string, number> | null | undefined;
                    const explicitWeekTarget = kpiWeeklyTargets?.[String(w)];
                    const targetForHelper = explicitWeekTarget != null
                      ? explicitWeekTarget * weekCount
                      : (kpi.qtdGoal ?? kpi.target ?? 0);
                    const { bg, text, label: cellLabel } = weekCellColors(val, targetForHelper, null, kpi.reverseColor ?? false, weekCount);
                    const colW = getColWidth(col);
                    const boundary = col === frozenUpTo;

                    // Team KPI: compute per-owner breakdown for the tooltip.
                    // Targets: prefer saved weeklyOwnerTargets; fall back to contribution % × aggregate weeklyTargets.
                    // Actuals (Phase 2): pull from kpi.weeklyOwnerValues (per-owner raw weekly values from the API).
                    let ownerBreakdown: { id: string; name: string; pct: number; target: number | null; actual: number | null }[] | undefined;
                    if (kpi.kpiLevel === "team" && kpi.owners && kpi.owners.length > 0) {
                      const ownerTargetsMap = (kpi.weeklyOwnerTargets as Record<string, Record<string, number>> | null | undefined) ?? null;
                      const aggregateTargets = (kpi.weeklyTargets as Record<string, number> | null | undefined) ?? null;
                      const contribs = (kpi.ownerContributions as Record<string, number> | null | undefined) ?? null;
                      const ownerValuesMap = kpi.weeklyOwnerValues ?? undefined;
                      ownerBreakdown = kpi.owners.map(o => {
                        const pct = contribs?.[o.id] ?? 0;
                        const savedOwnerTarget = ownerTargetsMap?.[o.id]?.[String(w)];
                        const derivedTarget = aggregateTargets?.[String(w)] != null
                          ? (aggregateTargets[String(w)] * pct) / 100
                          : null;
                        const target = savedOwnerTarget != null ? savedOwnerTarget : derivedTarget;
                        const ownerRow = ownerValuesMap?.[o.id];
                        const ownerActual = ownerRow?.find(v => v.weekNumber === w)?.value ?? null;
                        return {
                          id: o.id,
                          name: `${o.firstName} ${o.lastName}`,
                          pct,
                          target: target != null ? (kpi.measurementUnit === "Number" ? Math.round(target) : parseFloat(target.toFixed(2))) : null,
                          actual: ownerActual != null ? (kpi.measurementUnit === "Number" ? Math.round(ownerActual) : parseFloat(ownerActual.toFixed(2))) : null,
                        };
                      });
                    }

                    const hasContent = (val !== undefined && val !== null) || !!note || (ownerBreakdown && ownerBreakdown.length > 0);
                    const hasValue = val !== undefined && val !== null;
                    const isBlocked = currentWeek !== null && w < currentWeek && !canAddPastWeek && !hasValue;

                    return (
                      <td key={w}
                        className={[
                          "text-xs border-b border-r border-gray-100 text-center font-medium p-0",
                          isBlocked ? "bg-gray-50" : bg,
                          isBlocked ? "" : text,
                          isFrozen(col) ? `sticky z-[15]${boundary ? " shadow-[2px_0_4px_rgba(0,0,0,0.04)]" : ""}` : "",
                        ].join(" ")}
                        style={stickyStyle(col, colW)}
                        aria-label={`Week ${w}: ${isBlocked ? "blocked — no value logged" : hasValue ? val : "no data"} — ${cellLabel}`}>
                        {isBlocked ? (
                          <div className="flex items-center justify-center px-2 py-2">
                            <X className="h-3.5 w-3.5 text-red-400" />
                          </div>
                        ) : hasContent ? (
                          <WeekTooltip weekNumber={w} value={val} note={note} owners={ownerBreakdown}>
                            <div className="flex items-center justify-center w-full h-full px-2 py-2 cursor-default">
                              {hasValue
                                ? fmtN(kpi, val)
                                : <span className="text-gray-300 font-normal">—</span>}
                            </div>
                          </WeekTooltip>
                        ) : (
                          <div className="flex items-center justify-center px-2 py-2 text-gray-300 font-normal">—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </HorizontalScroller>

      {/* Floating "lifted" card that follows the cursor while dragging a row. */}
      {rowDnd.dragGhost}

      {infiniteMode && isFetchingMore && (
        <div className="flex items-center justify-center gap-2 py-2.5 text-xs text-gray-400 border-t border-gray-100 bg-gray-50">
          <svg className="h-4 w-4 animate-spin text-gray-300" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading more…
        </div>
      )}

      {paginationEnabled && (
        <Pagination
          page={effPage}
          totalPages={totalPages}
          total={total as number}
          limit={effPageSize}
          onPageChange={onPageChange as (p: number) => void}
          onPageSizeChange={onPageSizeChange}
        />
      )}

      {logKPI && <LogModal kpi={logKPI} onClose={() => setLogKPI(null)} onRefresh={onRefresh} initialTab={logInitialTab} canUpdate={canUpdate} onOpenHistory={() => setAuditKPI(logKPI)} />}
      {auditKPI && <ChangeHistoryPanel kpi={auditKPI} onClose={() => setAuditKPI(null)} />}
    </div>
  );
}
