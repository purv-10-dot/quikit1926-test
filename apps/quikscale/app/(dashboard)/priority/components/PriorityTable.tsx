"use client";

import { useState, useRef, useEffect, type UIEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PriorityRow } from "@/lib/types/priority";
import { weeksArray, weekDateLabel, getWeekDateRange } from "@/lib/utils/fiscal";
import { useQuarterStartDates } from "@/lib/hooks/useQuarterStartDates";
import { PriorityModal } from "./PriorityModal";
import { PriorityLogModal } from "./PriorityLogModal";
import { PriorityChangeHistoryPanel } from "./PriorityChangeHistoryPanel";
import { usePastWeekFlags, useCustomQuarterSettings, useWeeklyMeetingDay } from "@/lib/hooks/useFeatureFlags";
import { useCurrentWeek, useWeekLabels } from "@/lib/hooks/useCurrentWeek";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";
import { useTableSort } from "@/lib/store";
import { ColMenu } from "@/components/table/ColMenu";
import { SortIndicator } from "@/components/table/SortIndicator";
import { HiddenColsPill } from "@/components/table/HiddenColsPill";
import { UserAuditCell, DateAuditCell } from "@/components/table/AuditCells";
import { HorizontalScroller } from "@/components/ui/HorizontalScroller";
import { isNearBottom } from "@/lib/utils/scroll";
import { useColumnResize, ResizeHandle } from "@/lib/hooks/useColumnResize";
import { getLatestPriorityNote } from "@/lib/utils/priorityHelpers";
import { BaseTooltip } from "@/components/ui/base-tooltip";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { Pagination } from "@quikit/ui";
import { notify } from "@/lib/utils/notify";

import { STATUS_PICKER_OPTIONS, statusDotColor } from "@/lib/constants/status";

// ── Priority name tooltip ─────────────────────────────────────────────────────

function NameTooltip({ name, description, children }: { name: string; description?: string | null; children: React.ReactNode }) {
  return (
    <BaseTooltip
      width="w-72"
      className="p-3"
      content={
        <>
          <p className="font-semibold text-white leading-snug mb-1">{name}</p>
          {description && (
            <p className="text-gray-300 leading-relaxed line-clamp-5">{description}</p>
          )}
        </>
      }
    >
      {children}
    </BaseTooltip>
  );
}

// ── Week cell tooltip ─────────────────────────────────────────────────────────

function WeekTooltip({ weekNumber, status, note, children }: { weekNumber: number; status: string; note: string; children: React.ReactNode }) {
  const label = STATUS_PICKER_OPTIONS.find(o => o.value === status)?.label ?? null;

  return (
    <BaseTooltip
      width="w-44"
      arrowPosition="center"
      getLeft={(rect) => rect.left + rect.width / 2 - 88}
      className="p-2.5"
      wrapperClassName="w-full h-full"
      content={
        <>
          <p className="font-semibold text-gray-200 mb-1">Week {weekNumber}</p>
          {label ? (
            <p className="text-gray-300">{label}</p>
          ) : (
            <p className="text-gray-500 italic">No status set</p>
          )}
          {note && (
            <div className="mt-1.5 border-t border-gray-700 pt-1.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{note}</p>
            </div>
          )}
        </>
      }
    >
      {children}
    </BaseTooltip>
  );
}

// ── Status cell popover ───────────────────────────────────────────────────────

interface StatusPickerProps {
  priorityId: string;
  weekNumber: number;
  currentStatus: string;
  currentNote: string;
  onSave: (priorityId: string, weekNumber: number, status: string, notes: string) => void;
  onClose: () => void;
}

function StatusPicker({ priorityId, weekNumber, currentStatus, currentNote, onSave, onClose }: StatusPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [selectedStatus, setSelectedStatus] = useState(currentStatus);
  const [note, setNote] = useState(currentNote);
  useClickOutside(ref, onClose);

  return (
    <div ref={ref}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-52">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-100">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Week {weekNumber} Status</p>
      </div>
      {/* Status options */}
      <div className="py-1">
        {STATUS_PICKER_OPTIONS.map(opt => (
          <button key={opt.value}
            onClick={() => setSelectedStatus(opt.value)}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 transition-colors ${selectedStatus === opt.value ? "bg-gray-50 font-semibold" : "hover:bg-gray-50"}`}>
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${opt.color}`} />
            {opt.label}
            {selectedStatus === opt.value && (
              <svg className="ml-auto h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
      </div>
      {/* Note */}
      <div className="px-3 pb-2 border-t border-gray-100 pt-2">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-1.5">Note</p>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Add a note for this week…"
          rows={2}
          className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
        />
      </div>
      {/* Actions */}
      <div className="flex gap-2 px-3 pb-3">
        <button onClick={onClose}
          className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button
          onClick={() => { onSave(priorityId, weekNumber, selectedStatus, note); onClose(); }}
          className="flex-1 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium">
          Save
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  priorities: PriorityRow[];
  onRefresh: () => void;
  year: number;
  quarter: string;
  defaultYear?: number;
  defaultQuarter?: string;
  onSelectionChange?: (ids: Set<string>) => void;
  /** Columns to always hide on this instance (e.g. dashboard preview). Not persisted. */
  hideColumns?: string[];
  /** When true, all editing is disabled (view-only mode for dashboard previews). */
  readOnly?: boolean;
  /** Limit the number of rows displayed (for dashboard previews). */
  maxRows?: number;
  /** Pagination controls — when all four are provided, a pagination footer is rendered. */
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (p: number) => void;
  onPageSizeChange?: (size: number) => void;
  /** When true, the table stretches to 100% of its container instead of using
   *  `min-width: max-content`. Use this in dashboard previews where the
   *  number of week columns is small and we want to fill horizontal space. */
  fillWidth?: boolean;
  /** RBAC v2 — false disables row checkboxes + toasts. Defaults to true. */
  canDelete?: boolean;
  /** RBAC v2 — false makes opened edit drawers read-only. Defaults to true. */
  canUpdate?: boolean;
  /** Controlled sort override. When `onSort` is provided the table uses these
   *  props (backend sort keys, e.g. "priorityName") for the header indicator
   *  and routes clicks through `onSort` instead of its internal Redux store.
   *  Used by the Dashboard, which drives its own DB-level sort independently of
   *  the /priority page. When omitted, sort stays Redux-backed as before. */
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSort?: (col: string, dir: "asc" | "desc") => void;
  /** Infinite-scroll mode (dashboard). When `maxBodyHeight` is set the body
   *  becomes a fixed-height vertical scroll area (sticky header pins, scrollbars
   *  inside the card) and `onLoadMore` fires near the bottom. Omitted on the
   *  module page → unchanged. */
  maxBodyHeight?: number;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
}

export function PriorityTable({ priorities: prioritiesAll, onRefresh, year, quarter, defaultYear, defaultQuarter, onSelectionChange, hideColumns, readOnly, maxRows, page, pageSize, total, onPageChange, onPageSizeChange, fillWidth, canDelete = true, canUpdate = true, sortBy: sortByProp, sortOrder: sortOrderProp, onSort: onSortProp, maxBodyHeight, hasMore, isFetchingMore, onLoadMore }: Props) {
  // Cross-surface cache invalidation — when the inline cell picker saves a
  // weekly status/note, the Dashboard's `useDashboardSummary` query must
  // refetch so the Last Note / week cells update without a page reload.
  // Mirrors what `useUpdateWeeklyStatus` does for the modal-edit path.
  const queryClient = useQueryClient();
  const priorities = maxRows != null ? prioritiesAll.slice(0, maxRows) : prioritiesAll;
  const paginationEnabled = page != null && pageSize != null && total != null && onPageChange != null;
  const totalPages = paginationEnabled ? Math.max(1, Math.ceil((total as number) / (pageSize as number))) : 1;
  // Infinite-scroll mode: bounded-height body whose vertical scroll loads more.
  const infiniteMode = maxBodyHeight != null;
  const handleBodyScroll = (e: UIEvent<HTMLDivElement>) => {
    if (!infiniteMode || !hasMore || isFetchingMore) return;
    if (isNearBottom(e.currentTarget)) onLoadMore?.();
  };
  const [showAddModal, setShowAddModal] = useState(false);
  const [editPriority, setEditPriority] = useState<PriorityRow | null>(null);
  // Separate state for logs-only panel (triggered by the log icon).
  // Using a second state keeps the two entry points cleanly decoupled.
  const [logPriority, setLogPriority] = useState<PriorityRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openPicker, setOpenPicker] = useState<{ priorityId: string; weekNumber: number } | null>(null);

  // Optimistic weekly status updates (priorityId -> weekNumber -> status)
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, Record<number, string>>>({});
  // Optimistic notes (priorityId -> weekNumber -> notes)
  const [optimisticNotes, setOptimisticNotes] = useState<Record<string, Record<number, string>>>({});

  // Past-week feature flags
  const { canEditPastWeek } = usePastWeekFlags();
  const currentWeek = useCurrentWeek(year, quarter);
  const weekLabels = useWeekLabels(year, quarter);
  const { getStartDate: getQuarterStartDate, getEndDate: getQuarterEndDate, getWeekCount } = useQuarterStartDates();
  const qStart = getQuarterStartDate(year, quarter);
  // Custom Quarter Settings: meeting-day week alignment + quarter-end clamp for
  // the direct fiscal date helpers below. Null when the toggle is off → the
  // labels render exactly as before (legacy calendar weeks).
  const customQuarterOn = useCustomQuarterSettings();
  const rawMeetingDay = useWeeklyMeetingDay();
  const effectiveMeetingDay = customQuarterOn ? rawMeetingDay : null;
  const qEnd = getQuarterEndDate(year, quarter);
  // Weeks in this quarter (Custom Quarter Settings). Defaults to 13.
  const weekCount = getWeekCount(year, quarter);

  // Freeze + hidden cols stay in the DB-backed user pref. Sort moved to the
  // global Redux tables slice (lib/store) so it shares the same persistence
  // pattern as KPI and WWW. The "sort" / "setSort" fields on useTablePrefs are
  // intentionally unused here.
  const { frozenCol, setFrozenCol, hiddenCols, hideCol, showCol, showAllCols } = useTablePrefs("priority");
  const { sortBy: redSortBy, sortOrder: redSortOrder, setSort: setRedSort } = useTableSort("priority");
  // Controlled-sort override (Dashboard) wins over the Redux store. Keeps the
  // /priority page Redux-backed while letting the Dashboard sort independently.
  const controlledSort = onSortProp != null;
  const effSortBy = controlledSort ? (sortByProp ?? "") : redSortBy;
  const effSortOrder = controlledSort ? (sortOrderProp ?? "asc") : redSortOrder;
  const sort = effSortBy ? `${effSortBy}:${effSortOrder}` : null;
  const setSort = (next: string | null) => {
    if (!next) {
      if (controlledSort) onSortProp!("", "asc");
      else setRedSort({ sortBy: "", sortOrder: "asc" });
      return;
    }
    const [col, dir] = next.split(":") as [string, "asc" | "desc"];
    if (controlledSort) onSortProp!(col, dir);
    else setRedSort({ sortBy: col, sortOrder: dir });
  };

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange?.(next);
      return next;
    });
  }

  function toggleAll() {
    const next = selectedIds.size === priorities.length ? new Set<string>() : new Set(priorities.map(p => p.id));
    setSelectedIds(next);
    onSelectionChange?.(next);
  }

  async function handleWeeklyStatusSave(priorityId: string, weekNumber: number, status: string, notes: string) {
    // Build the list of (week, status, notes) writes for this save.
    // When the user marks a week as "completed", cascade Completed forward to
    // every subsequent week up to the end of the quarter (week 13). Existing
    // notes are preserved. If the priority's endWeek is shorter, it is
    // auto-extended to 13 via a parallel PUT so the grid shows blue cells
    // (instead of out-of-range X markers) for those weeks.
    const QUARTER_END = weekCount;
    const priority = prioritiesAll.find(p => p.id === priorityId);
    const currentEnd = priority?.endWeek ?? QUARTER_END;

    const writes: Array<{ weekNumber: number; status: string; notes: string }> = [
      { weekNumber, status, notes },
    ];
    if (status === "completed" && priority) {
      for (let w = weekNumber + 1; w <= QUARTER_END; w++) {
        if (getWeekStatus(priority, w) === "completed") continue;
        writes.push({ weekNumber: w, status: "completed", notes: getWeekNote(priority, w) });
      }
    }
    const shouldExtendEndWeek = status === "completed" && currentEnd < QUARTER_END;

    // Optimistic update — apply all writes at once
    setOptimisticStatuses(prev => {
      const inner = { ...(prev[priorityId] ?? {}) };
      for (const wr of writes) inner[wr.weekNumber] = wr.status;
      return { ...prev, [priorityId]: inner };
    });
    setOptimisticNotes(prev => {
      const inner = { ...(prev[priorityId] ?? {}) };
      for (const wr of writes) inner[wr.weekNumber] = wr.notes;
      return { ...prev, [priorityId]: inner };
    });
    try {
      await Promise.all([
        ...writes.map(wr =>
          fetch(`/api/priority/${priorityId}/weekly`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ weekNumber: wr.weekNumber, status: wr.status, notes: wr.notes }),
          }),
        ),
        ...(shouldExtendEndWeek
          ? [fetch(`/api/priority/${priorityId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ endWeek: QUARTER_END }),
            })]
          : []),
      ]);
      // Invalidate cross-surface caches so the Dashboard (and any other
      // React Query consumer of `priority` lists) refetches on next render.
      // Mirrors `useUpdateWeeklyStatus`'s onSuccess — same keys, same effect.
      queryClient.invalidateQueries({ queryKey: ["priority"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onRefresh();
    } catch {
      // revert all writes
      setOptimisticStatuses(prev => {
        const copy = { ...prev };
        if (copy[priorityId]) {
          const inner = { ...copy[priorityId] };
          for (const wr of writes) delete inner[wr.weekNumber];
          copy[priorityId] = inner;
        }
        return copy;
      });
      setOptimisticNotes(prev => {
        const copy = { ...prev };
        if (copy[priorityId]) {
          const inner = { ...copy[priorityId] };
          for (const wr of writes) delete inner[wr.weekNumber];
          copy[priorityId] = inner;
        }
        return copy;
      });
    }
  }

  function getWeekStatus(priority: PriorityRow, weekNumber: number): string {
    const optimistic = optimisticStatuses[priority.id]?.[weekNumber];
    if (optimistic !== undefined) return optimistic;
    const ws = priority.weeklyStatuses.find(s => s.weekNumber === weekNumber);
    return ws?.status ?? "";
  }

  function getWeekNote(priority: PriorityRow, weekNumber: number): string {
    const optimistic = optimisticNotes[priority.id]?.[weekNumber];
    if (optimistic !== undefined) return optimistic;
    const ws = priority.weeklyStatuses.find(s => s.weekNumber === weekNumber);
    return ws?.notes ?? "";
  }

  function isInRange(priority: PriorityRow, weekNumber: number): boolean {
    const sw = priority.startWeek ?? 1;
    const ew = priority.endWeek ?? 13;
    return weekNumber >= sw && weekNumber <= ew;
  }

  // Column layout — checkbox/log/id are ALWAYS frozen/visible; others are user-controlled
  const COL_ORDER_FULL = [
    "_cb", "_log", "_id", "team", "priorityName", "owner",
    "startWeek", "endWeek", "lastNote", "importedFromOpsp",
    // Audit columns — last, before week columns.
    "createdBy", "updatedBy", "createdAt", "updatedAt",
  ];
  const COL_WIDTHS: Record<string, number> = {
    _cb: 40, _log: 40, _id: 40, team: 120, priorityName: 260, owner: 140,
    startWeek: 170, endWeek: 170, lastNote: 200, importedFromOpsp: 150,
    createdBy: 160, updatedBy: 160, createdAt: 130, updatedAt: 130,
  };
  // Drag-to-resize: persisted widths override the defaults above.
  // _cb/_log/_id stay at their defaults (always-frozen chrome — no handle rendered).
  const { getColWidth, startResize } = useColumnResize("priority", COL_WIDTHS);
  const COL_LABELS: Record<string, string> = {
    team: "Team", priorityName: "Priority Name", owner: "Owner",
    startWeek: "Start Week", endWeek: "End Week", lastNote: "Last Note",
    importedFromOpsp: "Imported from OPSP",
    createdBy: "Created By", updatedBy: "Updated By",
    createdAt: "Created Date", updatedAt: "Updated Date",
  };
  const ALWAYS_VISIBLE = new Set(["_cb", "_log", "_id"]);
  const ALWAYS_FROZEN = new Set(["_cb", "_log", "_id"]);
  const SORT_KEYS_MAP: Record<string, string> = { team: "team", priorityName: "priorityName", owner: "owner", startWeek: "startWeek", endWeek: "endWeek" };

  // Filter out hidden columns.
  // - Persisted `hiddenCols` cannot hide ALWAYS_VISIBLE cols (checkbox/log/id)
  // - Per-instance `hideColumns` prop CAN hide anything (used by dashboard preview)
  const instanceHides = new Set(hideColumns ?? []);
  const persistedHides = new Set(hiddenCols);
  // Allow the dashboard to limit which week columns are visible by passing
  // `week${n}` keys in `hideColumns`. Default keeps the full 13-week grid.
  const visibleWeeksList = weeksArray(weekCount).filter(w => !instanceHides.has(`week${w}`));
  const COL_ORDER = COL_ORDER_FULL.filter((c) => {
    if (instanceHides.has(c)) return false;
    if (ALWAYS_VISIBLE.has(c)) return true;
    return !persistedHides.has(c);
  });
  const hiddenSet = new Set([...persistedHides, ...instanceHides]);

  // Compute which columns are frozen
  const frozenIdx = frozenCol ? COL_ORDER.indexOf(frozenCol) : -1;
  const isColFrozen = (colKey: string) => {
    if (ALWAYS_FROZEN.has(colKey)) return true;
    if (frozenIdx < 0) return false;
    return COL_ORDER.indexOf(colKey) <= frozenIdx;
  };

  // Calculate left offset for each sticky column
  const getLeftOffset = (colKey: string): number => {
    let left = 0;
    for (const c of COL_ORDER) {
      if (c === colKey) return left;
      if (isColFrozen(c)) left += getColWidth(c);
    }
    return left;
  };

  // Last frozen column for shadow boundary
  const lastFrozenKey = (() => {
    let last = "_id";
    for (const c of COL_ORDER) if (isColFrozen(c)) last = c;
    return last;
  })();

  // Sort handlers
  const [sortCol, sortDir] = sort ? (sort.split(":") as [string, "asc" | "desc"]) : [null, null];
  function handleSort(colKey: string, dir: "asc" | "desc") {
    setSort(`${colKey}:${dir}`);
  }

  function handleFreezeCol(colKey: string) {
    setFrozenCol(frozenCol === colKey ? null : colKey);
  }

  function handleHideCol(colKey: string) {
    hideCol(colKey);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Table */}
      <HorizontalScroller
        className="flex-1"
        innerStyle={infiniteMode ? { maxHeight: maxBodyHeight } : undefined}
        showVerticalScrollbar={infiniteMode}
        onContentScroll={infiniteMode ? handleBodyScroll : undefined}
      >
        <table
          className="border-collapse"
          // `fillWidth=true` (Dashboard preview): stretch to the container so
          // the table doesn't leave a gray gap on the right when the natural
          // column-widths sum is narrower than the available space. The
          // `minWidth: max-content` floor still kicks in when total widths
          // EXCEED the container, so horizontal scroll continues to work via
          // the wrapping <HorizontalScroller>.
          // Standalone page (`fillWidth=false`) keeps natural sizing.
          style={fillWidth
            ? { width: "100%", minWidth: "max-content", tableLayout: "fixed" }
            : { minWidth: "max-content", tableLayout: "fixed" }}>
          {/* Sticky header — matches KPITable behaviour. Without `sticky top-0`
              on the <thead>, the header row scrolls away with the body during
              vertical scroll. The frozen <th> cells additionally use their
              own `sticky left:` so they stay pinned during horizontal scroll. */}
          <thead className="sticky top-0 z-30">
            <tr className="bg-accent-50 border-b border-gray-200">
              {/* Header cells — checkbox/log/id always sticky, others sticky if isColFrozen */}
              {COL_ORDER.map((colKey) => {
                const frozen = isColFrozen(colKey);
                const width = getColWidth(colKey);
                const isAlwaysFrozen = ALWAYS_FROZEN.has(colKey);
                const label =
                  colKey === "_cb" ? "" :
                  colKey === "_log" ? "Log" :
                  colKey === "_id" ? "ID" :
                  COL_LABELS[colKey] ?? "";
                const showMenu = !ALWAYS_FROZEN.has(colKey);
                const isBoundary = frozen && colKey === lastFrozenKey;
                const sortKey = SORT_KEYS_MAP[colKey];
                const isSorted = sortKey && sortCol === sortKey;

                return (
                  <th key={colKey}
                    // Always `sticky top-0` so the header pins on vertical scroll.
                    // Frozen cells additionally get a `left:` offset so they pin
                    // on horizontal scroll (matches KPITable's pattern).
                    // `z-[35]` for frozen cells so they sit above unfrozen
                    // headers (z-30) during horizontal scroll — otherwise
                    // unfrozen cells slide *over* frozen ones and the leftmost
                    // headers visually disappear.
                    // `relative` was previously here and was overriding `sticky`
                    // in the CSS cascade — removed.
                    className={`group sticky top-0 ${frozen ? "z-[35]" : "z-30"} bg-accent-50 border-b border-gray-200 border-r border-r-gray-200 text-left px-2 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap select-none`}
                    style={{
                      left: frozen ? getLeftOffset(colKey) : undefined,
                      width,
                      minWidth: width,
                      boxShadow: isBoundary ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                    }}>
                    {colKey === "_cb" ? (
                      <label
                        onClickCapture={(e) => {
                          if (!canDelete) {
                            e.preventDefault();
                            e.stopPropagation();
                            notify.error("You don't have permission to delete");
                          }
                        }}
                      >
                        <input type="checkbox"
                          checked={selectedIds.size === priorities.length && priorities.length > 0}
                          onChange={toggleAll} disabled={!canDelete}
                          className={`rounded border-gray-300 text-blue-600 ${canDelete ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`} />
                      </label>
                    ) : (
                      <div className="flex items-center justify-between gap-1">
                        <span className="inline-flex items-center gap-1">
                          {frozenCol === colKey && (
                            <svg className="h-3 w-3 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          {/* `title` surfaces the full label as a native tooltip
                              when the column is narrow enough to ellipsize
                              (common on Dashboard previews). */}
                          <span title={label} className={isSorted ? "text-accent-700" : ""}>{label}</span>
                          <SortIndicator active={!!isSorted} direction={sortDir} />
                        </span>
                        {showMenu && (
                          <ColMenu
                            colKey={colKey}
                            onSort={sortKey ? (dir) => handleSort(sortKey, dir) : undefined}
                            onFreeze={() => handleFreezeCol(colKey)}
                            onHide={() => handleHideCol(colKey)}
                            frozen={frozen}
                            showSort={!!sortKey}
                          />
                        )}
                      </div>
                    )}
                    {/* Resize handle — skip on always-frozen chrome (cb/log/id) */}
                    {!isAlwaysFrozen && (
                      <ResizeHandle onStart={(e) => startResize(colKey, e.clientX)} />
                    )}
                  </th>
                );
              })}

              {/* Week header cells. `width` (not just minWidth) is required so
                  table-layout: fixed locks the column to 76px. Without an
                  explicit width these columns become "elastic" and silently
                  shrink whenever the user resizes a named column wider —
                  exactly the visual squish bug reported on 2026-05-27. */}
              {visibleWeeksList.map(w => (
                <th key={w}
                  className="sticky top-0 z-20 bg-accent-50 border-b border-gray-200 border-r border-r-gray-100 text-center px-1 py-2 text-[10px] font-semibold text-gray-500 whitespace-nowrap select-none"
                  style={{ width: 76, minWidth: 76 }}>
                  <div>Week {w}</div>
                  <div className="text-[9px] font-normal text-gray-400">{weekLabels[w - 1] ?? weekDateLabel(year, quarter, w, qStart, effectiveMeetingDay, qEnd)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {priorities.length === 0 && (
              <tr>
                <td colSpan={COL_ORDER.length + visibleWeeksList.length} className="text-center py-12 text-xs text-gray-400">
                  No priorities found for this period
                </td>
              </tr>
            )}
            {priorities.map((priority, rowIdx) => {
              const ownerName = priority.owner_user
                ? `${priority.owner_user.firstName} ${priority.owner_user.lastName}`
                : "—";
              return (
                <tr key={priority.id}
                  className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                  {/* Checkbox — always frozen. z-[25] keeps it above non-frozen
                      body cells (z-20) during horizontal scroll so the
                      sticky cell stays visually on top instead of being
                      covered by scrolling neighbours. */}
                  {COL_ORDER.includes("_cb") && (
                    <td className="sticky z-[25] border-r border-gray-100 px-2 py-1.5 bg-inherit"
                      style={{ left: getLeftOffset("_cb"), width: 40, minWidth: 40 }}>
                      <label
                        onClickCapture={(e) => {
                          if (!canDelete) {
                            e.preventDefault();
                            e.stopPropagation();
                            notify.error("You don't have permission to delete");
                          }
                        }}
                      >
                        <input type="checkbox"
                          checked={selectedIds.has(priority.id)}
                          onChange={() => toggleSelect(priority.id)} disabled={!canDelete}
                          className={`rounded border-gray-300 text-blue-600 ${canDelete ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`} />
                      </label>
                    </td>
                  )}

                  {/* Log icon — always frozen. z-[25] same reason as the cb cell. */}
                  {COL_ORDER.includes("_log") && (
                    <td className="sticky z-[25] border-r border-gray-100 px-1 py-1.5 text-center bg-inherit"
                      style={{ left: getLeftOffset("_log"), width: 40, minWidth: 40 }}>
                      <button onClick={() => setLogPriority(priority)}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
                        title="Open log">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    </td>
                  )}

                  {/* ID — always frozen. z-[25] same reason as the cb cell. */}
                  {COL_ORDER.includes("_id") && (
                    <td className="z-[25] border-r border-gray-100 px-1 py-1.5 text-center bg-inherit sticky"
                      style={{
                        left: getLeftOffset("_id"),
                        width: 40,
                        minWidth: 40,
                        boxShadow: lastFrozenKey === "_id" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      <button onClick={() => setEditPriority(priority)}
                        className="text-gray-900 hover:underline font-medium text-xs transition-colors">
                        {rowIdx + 1}
                      </button>
                    </td>
                  )}

                  {/* Team — user-freezable, hidable */}
                  {COL_ORDER.includes("team") && (
                    <td className={`z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit ${isColFrozen("team") ? "sticky" : ""}`}
                      style={{
                        left: isColFrozen("team") ? getLeftOffset("team") : undefined,
                        width: getColWidth("team"),
                        minWidth: getColWidth("team"),
                        boxShadow: lastFrozenKey === "team" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      <span className="text-xs text-gray-600 truncate block">
                        {priority.team?.name ?? <span className="text-gray-300">—</span>}
                      </span>
                    </td>
                  )}

                  {/* Priority Name — user-freezable, hidable */}
                  {COL_ORDER.includes("priorityName") && (
                    <td className={`z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit overflow-hidden align-top ${isColFrozen("priorityName") ? "sticky" : ""}`}
                      style={{
                        left: isColFrozen("priorityName") ? getLeftOffset("priorityName") : undefined,
                        width: getColWidth("priorityName"),
                        minWidth: getColWidth("priorityName"),
                        boxShadow: lastFrozenKey === "priorityName" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      <NameTooltip name={priority.name} description={priority.description}>
                        <span className="text-xs text-gray-800 font-medium line-clamp-2 leading-snug cursor-default break-words">
                          {priority.name}
                        </span>
                      </NameTooltip>
                    </td>
                  )}

                  {/* Owner — user-freezable, hidable */}
                  {COL_ORDER.includes("owner") && (
                    <td className={`z-20 border-r border-gray-200 px-2 py-1.5 bg-inherit ${isColFrozen("owner") ? "sticky" : ""}`}
                      style={{
                        left: isColFrozen("owner") ? getLeftOffset("owner") : undefined,
                        width: getColWidth("owner"),
                        minWidth: getColWidth("owner"),
                        boxShadow: lastFrozenKey === "owner" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      <span className="text-xs text-gray-600 truncate block">{ownerName}</span>
                    </td>
                  )}

                  {/* Start Week — user-freezable, hidable */}
                  {COL_ORDER.includes("startWeek") && (
                    <td className={`z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit ${isColFrozen("startWeek") ? "sticky" : ""}`}
                      style={{
                        left: isColFrozen("startWeek") ? getLeftOffset("startWeek") : undefined,
                        width: getColWidth("startWeek"),
                        minWidth: getColWidth("startWeek"),
                        boxShadow: lastFrozenKey === "startWeek" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      {priority.startWeek != null ? (
                        <span className="text-xs text-gray-700 whitespace-nowrap">
                          Week {priority.startWeek}{" "}
                          <span className="text-gray-400">({getWeekDateRange(year, quarter, priority.startWeek, qStart, effectiveMeetingDay, qEnd)})</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  )}

                  {/* End Week — user-freezable, hidable */}
                  {COL_ORDER.includes("endWeek") && (
                    <td className={`z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit ${isColFrozen("endWeek") ? "sticky" : ""}`}
                      style={{
                        left: isColFrozen("endWeek") ? getLeftOffset("endWeek") : undefined,
                        width: getColWidth("endWeek"),
                        minWidth: getColWidth("endWeek"),
                        boxShadow: lastFrozenKey === "endWeek" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      {priority.endWeek != null ? (
                        <span className="text-xs text-gray-700 whitespace-nowrap">
                          Week {priority.endWeek}{" "}
                          <span className="text-gray-400">({getWeekDateRange(year, quarter, priority.endWeek, qStart, effectiveMeetingDay, qEnd)})</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  )}

                  {/* Last Note — user-freezable, hidable. Shows the most
                      RECENTLY EDITED weekly note (max updatedAt), not the
                      highest-numbered week. Optimistic edits always win
                      because they're the freshest. See `getLatestPriorityNote`. */}
                  {COL_ORDER.includes("lastNote") && (() => {
                    const latest = getLatestPriorityNote(
                      priority.weeklyStatuses,
                      optimisticNotes[priority.id],
                      priority.notes,
                    );
                    return (
                      <td className={`z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit ${isColFrozen("lastNote") ? "sticky" : ""}`}
                        style={{
                          left: isColFrozen("lastNote") ? getLeftOffset("lastNote") : undefined,
                          width: getColWidth("lastNote"),
                          minWidth: getColWidth("lastNote"),
                          boxShadow: lastFrozenKey === "lastNote" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                        }}>
                        {latest ? (
                          // Mirror KPI Name's wrap-with-3-line-scroll pattern
                          // (KPITable.tsx). `max-h-[3.25rem]` fits 3 lines of
                          // text-xs/leading-snug; longer notes scroll inside
                          // the cell rather than stretching the column.
                          // `break-all` handles pasted unbreakable strings
                          // (URLs, IDs, gibberish) without horizontal overflow.
                          <div
                            className="max-h-[3.25rem] overflow-y-auto leading-snug break-all text-xs text-gray-600 cursor-default pr-1"
                            style={{ scrollbarWidth: "thin" }}
                            title={latest.note}
                          >
                            {latest.weekNumber != null && (
                              <span className="text-gray-400 mr-1">W{latest.weekNumber}:</span>
                            )}
                            {latest.note}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    );
                  })()}

                  {/* Imported from OPSP — Yes when created via the OPSP
                      "Export → Create Priorities" flow. Neutral styling (locked table). */}
                  {COL_ORDER.includes("importedFromOpsp") && (
                    <td className={`z-20 border-r border-gray-100 px-3 py-1.5 bg-inherit ${isColFrozen("importedFromOpsp") ? "sticky" : ""}`}
                      style={{
                        left: isColFrozen("importedFromOpsp") ? getLeftOffset("importedFromOpsp") : undefined,
                        width: getColWidth("importedFromOpsp"),
                        minWidth: getColWidth("importedFromOpsp"),
                        boxShadow: lastFrozenKey === "importedFromOpsp" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      {priority.importedFromOpsp ? (
                        <span className="text-xs text-gray-700 font-medium">Yes</span>
                      ) : (
                        <span className="text-xs text-gray-300">No</span>
                      )}
                    </td>
                  )}

                  {/* Audit columns — Created By / Updated By / Created Date / Updated Date.
                      Populated by GET /api/priority via decorateAudit. */}
                  {COL_ORDER.includes("createdBy") && (
                    <td className={`z-20 border-r border-gray-100 px-3 py-1.5 bg-inherit ${isColFrozen("createdBy") ? "sticky" : ""}`}
                      style={{
                        left: isColFrozen("createdBy") ? getLeftOffset("createdBy") : undefined,
                        width: getColWidth("createdBy"),
                        minWidth: getColWidth("createdBy"),
                        boxShadow: lastFrozenKey === "createdBy" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      <UserAuditCell name={priority.createdByName} initials={priority.createdByInitials} />
                    </td>
                  )}
                  {COL_ORDER.includes("updatedBy") && (
                    <td className={`z-20 border-r border-gray-100 px-3 py-1.5 bg-inherit ${isColFrozen("updatedBy") ? "sticky" : ""}`}
                      style={{
                        left: isColFrozen("updatedBy") ? getLeftOffset("updatedBy") : undefined,
                        width: getColWidth("updatedBy"),
                        minWidth: getColWidth("updatedBy"),
                        boxShadow: lastFrozenKey === "updatedBy" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      <UserAuditCell name={priority.updatedByName} initials={priority.updatedByInitials} />
                    </td>
                  )}
                  {COL_ORDER.includes("createdAt") && (
                    <td className={`z-20 border-r border-gray-100 px-3 py-1.5 bg-inherit ${isColFrozen("createdAt") ? "sticky" : ""}`}
                      style={{
                        left: isColFrozen("createdAt") ? getLeftOffset("createdAt") : undefined,
                        width: getColWidth("createdAt"),
                        minWidth: getColWidth("createdAt"),
                        boxShadow: lastFrozenKey === "createdAt" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      <DateAuditCell iso={priority.createdAt} />
                    </td>
                  )}
                  {COL_ORDER.includes("updatedAt") && (
                    <td className={`z-20 border-r border-gray-100 px-3 py-1.5 bg-inherit ${isColFrozen("updatedAt") ? "sticky" : ""}`}
                      style={{
                        left: isColFrozen("updatedAt") ? getLeftOffset("updatedAt") : undefined,
                        width: getColWidth("updatedAt"),
                        minWidth: getColWidth("updatedAt"),
                        boxShadow: lastFrozenKey === "updatedAt" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      <DateAuditCell iso={priority.updatedAt} />
                    </td>
                  )}

                  {/* Week cells */}
                  {visibleWeeksList.map(w => {
                    const inRange = isInRange(priority, w);
                    const status = getWeekStatus(priority, w);
                    const note = getWeekNote(priority, w);
                    const isOpen = openPicker?.priorityId === priority.id && openPicker?.weekNumber === w;

                    if (!inRange) {
                      return (
                        <td key={w} className="border-r border-gray-100 px-0 py-0 bg-gray-50" style={{ width: 76, minWidth: 76, height: 34 }}>
                          <div className="w-full h-full flex items-center justify-center" style={{ minHeight: 34 }}>
                            <svg className="h-3 w-3 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </div>
                        </td>
                      );
                    }

                    const isPastLocked = !canEditPastWeek && currentWeek !== null && w < currentWeek;
                    return (
                      <td key={w} className="relative border-r border-gray-100 px-0 py-0" style={{ width: 76, minWidth: 76, height: 34 }}>
                        <WeekTooltip weekNumber={w} status={status} note={note}>
                          <button
                            onClick={() => {
                              if (isPastLocked || readOnly) return;
                              setOpenPicker(isOpen ? null : { priorityId: priority.id, weekNumber: w });
                            }}
                            disabled={isPastLocked || readOnly}
                            title={isPastLocked ? "Past week editing is disabled. Enable in Settings > Configurations." : undefined}
                            className={`w-full h-full flex items-center justify-center transition-opacity ${statusDotColor(status)} ${(isPastLocked || readOnly) ? "cursor-default" : "hover:opacity-80"} ${isPastLocked ? "opacity-50" : ""}`}
                            style={{ minHeight: 34 }}>
                            {isPastLocked && (
                              <svg className="h-2.5 w-2.5 text-white/60" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                              </svg>
                            )}
                          </button>
                        </WeekTooltip>
                        {isOpen && !isPastLocked && !readOnly && (
                          <StatusPicker
                            priorityId={priority.id}
                            weekNumber={w}
                            currentStatus={status}
                            currentNote={note}
                            onSave={handleWeeklyStatusSave}
                            onClose={() => setOpenPicker(null)}
                          />
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

      {infiniteMode && isFetchingMore && (
        <div className="flex items-center justify-center gap-2 py-2.5 text-xs text-gray-400 border-t border-gray-100 bg-gray-50">
          <svg className="h-4 w-4 animate-spin text-gray-300" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading more…
        </div>
      )}

      {/* Pagination footer */}
      {paginationEnabled && (
        <Pagination
          page={page as number}
          totalPages={totalPages}
          total={total as number}
          limit={pageSize as number}
          onPageChange={onPageChange as (p: number) => void}
          onPageSizeChange={onPageSizeChange}
        />
      )}

      {/* Add New Modal */}
      {showAddModal && (
        <PriorityModal
          defaultYear={defaultYear ?? year}
          defaultQuarter={defaultQuarter ?? quarter}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); onRefresh(); }}
        />
      )}

      {/* Edit Modal — full panel with Edit / Weekly / Notes tabs */}
      {editPriority && (
        <PriorityLogModal
          priority={editPriority}
          onClose={() => setEditPriority(null)}
          onSuccess={() => { setEditPriority(null); onRefresh(); }}
          canUpdate={canUpdate}
        />
      )}

      {/* Change-history panel — full audit timeline (triggered by log icon) */}
      {logPriority && (
        <PriorityChangeHistoryPanel
          priority={logPriority}
          onClose={() => setLogPriority(null)}
        />
      )}
    </div>
  );
}
