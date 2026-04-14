"use client";

import { useState, useRef, useEffect } from "react";
import type { PriorityRow } from "@/lib/types/priority";
import { ALL_WEEKS, weekDateLabel, getWeekDateRange } from "@/lib/utils/fiscal";
import { PriorityModal } from "./PriorityModal";
import { PriorityLogModal } from "./PriorityLogModal";
import { usePastWeekFlags } from "@/lib/hooks/useFeatureFlags";
import { useCurrentWeek } from "@/lib/hooks/useCurrentWeek";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";
import { ColMenu } from "@/components/table/ColMenu";
import { HiddenColsPill } from "@/components/table/HiddenColsPill";
import { BaseTooltip } from "@/components/ui/base-tooltip";
import { useClickOutside } from "@/lib/hooks/useClickOutside";

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
}

export function PriorityTable({ priorities: prioritiesAll, onRefresh, year, quarter, defaultYear, defaultQuarter, onSelectionChange, hideColumns, readOnly, maxRows, page, pageSize, total, onPageChange }: Props) {
  const priorities = maxRows != null ? prioritiesAll.slice(0, maxRows) : prioritiesAll;
  const paginationEnabled = page != null && pageSize != null && total != null && onPageChange != null;
  const totalPages = paginationEnabled ? Math.max(1, Math.ceil((total as number) / (pageSize as number))) : 1;
  const [showAddModal, setShowAddModal] = useState(false);
  const [editPriority, setEditPriority] = useState<PriorityRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openPicker, setOpenPicker] = useState<{ priorityId: string; weekNumber: number } | null>(null);

  // Optimistic weekly status updates (priorityId -> weekNumber -> status)
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, Record<number, string>>>({});
  // Optimistic notes (priorityId -> weekNumber -> notes)
  const [optimisticNotes, setOptimisticNotes] = useState<Record<string, Record<number, string>>>({});

  // Past-week feature flags
  const { canEditPastWeek } = usePastWeekFlags();
  const currentWeek = useCurrentWeek(year, quarter);

  // Table preferences (freeze + hidden cols + sort) persisted per user in DB
  const { frozenCol, setFrozenCol, hiddenCols, hideCol, showCol, showAllCols, sort, setSort } = useTablePrefs("priority");

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
    // Optimistic update
    setOptimisticStatuses(prev => ({
      ...prev,
      [priorityId]: { ...prev[priorityId], [weekNumber]: status },
    }));
    setOptimisticNotes(prev => ({
      ...prev,
      [priorityId]: { ...prev[priorityId], [weekNumber]: notes },
    }));
    try {
      await fetch(`/api/priority/${priorityId}/weekly`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekNumber, status, notes }),
      });
      onRefresh();
    } catch {
      // revert
      setOptimisticStatuses(prev => {
        const copy = { ...prev };
        if (copy[priorityId]) {
          const inner = { ...copy[priorityId] };
          delete inner[weekNumber];
          copy[priorityId] = inner;
        }
        return copy;
      });
      setOptimisticNotes(prev => {
        const copy = { ...prev };
        if (copy[priorityId]) {
          const inner = { ...copy[priorityId] };
          delete inner[weekNumber];
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
  const COL_ORDER_FULL = ["_cb", "_log", "_id", "team", "priorityName", "owner", "startWeek", "endWeek", "lastNote"];
  const COL_WIDTHS: Record<string, number> = {
    _cb: 40, _log: 40, _id: 40, team: 120, priorityName: 200, owner: 140,
    startWeek: 170, endWeek: 170, lastNote: 200,
  };
  const COL_LABELS: Record<string, string> = {
    team: "Team", priorityName: "Priority Name", owner: "Owner",
    startWeek: "Start Week", endWeek: "End Week", lastNote: "Last Note",
  };
  const ALWAYS_VISIBLE = new Set(["_cb", "_log", "_id"]);
  const ALWAYS_FROZEN = new Set(["_cb", "_log", "_id"]);
  const SORT_KEYS_MAP: Record<string, string> = { team: "team", priorityName: "priorityName", owner: "owner", startWeek: "startWeek", endWeek: "endWeek" };

  // Filter out hidden columns.
  // - Persisted `hiddenCols` cannot hide ALWAYS_VISIBLE cols (checkbox/log/id)
  // - Per-instance `hideColumns` prop CAN hide anything (used by dashboard preview)
  const instanceHides = new Set(hideColumns ?? []);
  const persistedHides = new Set(hiddenCols);
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
      if (isColFrozen(c)) left += COL_WIDTHS[c];
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
      <div className="flex-1 overflow-auto">
        <table className="border-collapse" style={{ minWidth: "max-content" }}>
          <thead>
            <tr className="bg-accent-50 border-b border-gray-200">
              {/* Header cells — checkbox/log/id always sticky, others sticky if isColFrozen */}
              {COL_ORDER.map((colKey) => {
                const frozen = isColFrozen(colKey);
                const width = COL_WIDTHS[colKey];
                const label =
                  colKey === "_cb" ? "" :
                  colKey === "_log" ? "" :
                  colKey === "_id" ? "ID" :
                  COL_LABELS[colKey] ?? "";
                const showMenu = !ALWAYS_FROZEN.has(colKey);
                const isBoundary = frozen && colKey === lastFrozenKey;
                const sortKey = SORT_KEYS_MAP[colKey];
                const isSorted = sortKey && sortCol === sortKey;

                return (
                  <th key={colKey}
                    className={`group top-0 z-30 bg-accent-50 border-b border-gray-200 border-r border-r-gray-200 text-left px-2 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap select-none ${frozen ? "sticky" : ""}`}
                    style={{
                      left: frozen ? getLeftOffset(colKey) : undefined,
                      width,
                      minWidth: width,
                      boxShadow: isBoundary ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                    }}>
                    {colKey === "_cb" ? (
                      <input type="checkbox"
                        checked={selectedIds.size === priorities.length && priorities.length > 0}
                        onChange={toggleAll}
                        className="rounded border-gray-300 text-blue-600 cursor-pointer" />
                    ) : (
                      <div className="flex items-center justify-between gap-1">
                        <span className="inline-flex items-center gap-1">
                          {frozenCol === colKey && (
                            <svg className="h-3 w-3 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          {label}
                          {isSorted && (
                            <svg className="h-2.5 w-2.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d={sortDir === "asc" ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                            </svg>
                          )}
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
                  </th>
                );
              })}

              {/* Week header cells */}
              {ALL_WEEKS.map(w => (
                <th key={w}
                  className="sticky top-0 z-20 bg-accent-50 border-b border-gray-200 border-r border-r-gray-100 text-center px-1 py-2 text-[10px] font-semibold text-gray-500 whitespace-nowrap select-none"
                  style={{ minWidth: 76 }}>
                  <div>Week {w}</div>
                  <div className="text-[9px] font-normal text-gray-400">{weekDateLabel(year, quarter, w)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {priorities.length === 0 && (
              <tr>
                <td colSpan={COL_ORDER.length + ALL_WEEKS.length} className="text-center py-12 text-xs text-gray-400">
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
                  {/* Checkbox — always frozen (hidable only via hideColumns prop) */}
                  {COL_ORDER.includes("_cb") && (
                    <td className="sticky z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit"
                      style={{ left: getLeftOffset("_cb"), width: 40, minWidth: 40 }}>
                      <input type="checkbox"
                        checked={selectedIds.has(priority.id)}
                        onChange={() => toggleSelect(priority.id)}
                        className="rounded border-gray-300 text-blue-600 cursor-pointer" />
                    </td>
                  )}

                  {/* Log icon — always frozen (hidable only via hideColumns prop) */}
                  {COL_ORDER.includes("_log") && (
                    <td className="sticky z-20 border-r border-gray-100 px-1 py-1.5 text-center bg-inherit"
                      style={{ left: getLeftOffset("_log"), width: 40, minWidth: 40 }}>
                      <button onClick={() => setEditPriority(priority)}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
                        title="Open log">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    </td>
                  )}

                  {/* ID — always frozen (hidable only via hideColumns prop) */}
                  {COL_ORDER.includes("_id") && (
                    <td className="z-20 border-r border-gray-100 px-1 py-1.5 text-center bg-inherit sticky"
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
                        width: 120,
                        minWidth: 120,
                        boxShadow: lastFrozenKey === "team" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      <span className="text-xs text-gray-600 truncate block max-w-[108px]">
                        {priority.team?.name ?? <span className="text-gray-300">—</span>}
                      </span>
                    </td>
                  )}

                  {/* Priority Name — user-freezable, hidable */}
                  {COL_ORDER.includes("priorityName") && (
                    <td className={`z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit ${isColFrozen("priorityName") ? "sticky" : ""}`}
                      style={{
                        left: isColFrozen("priorityName") ? getLeftOffset("priorityName") : undefined,
                        width: 200,
                        minWidth: 200,
                        boxShadow: lastFrozenKey === "priorityName" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      <NameTooltip name={priority.name} description={priority.description}>
                        <span className="text-xs text-gray-800 font-medium truncate block max-w-[188px] cursor-default">
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
                        width: 140,
                        minWidth: 140,
                        boxShadow: lastFrozenKey === "owner" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      <span className="text-xs text-gray-600 truncate block max-w-[128px]">{ownerName}</span>
                    </td>
                  )}

                  {/* Start Week — user-freezable, hidable */}
                  {COL_ORDER.includes("startWeek") && (
                    <td className={`z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit ${isColFrozen("startWeek") ? "sticky" : ""}`}
                      style={{
                        left: isColFrozen("startWeek") ? getLeftOffset("startWeek") : undefined,
                        width: 170,
                        minWidth: 170,
                        boxShadow: lastFrozenKey === "startWeek" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      {priority.startWeek != null ? (
                        <span className="text-xs text-gray-700 whitespace-nowrap">
                          Week {priority.startWeek}{" "}
                          <span className="text-gray-400">({getWeekDateRange(year, quarter, priority.startWeek)})</span>
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
                        width: 170,
                        minWidth: 170,
                        boxShadow: lastFrozenKey === "endWeek" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      {priority.endWeek != null ? (
                        <span className="text-xs text-gray-700 whitespace-nowrap">
                          Week {priority.endWeek}{" "}
                          <span className="text-gray-400">({getWeekDateRange(year, quarter, priority.endWeek)})</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                  )}

                  {/* Last Note — user-freezable, hidable. Shows the most recent weekly note (highest week with a note). */}
                  {COL_ORDER.includes("lastNote") && (() => {
                    // Find the most recent weekly note (highest weekNumber with a non-empty note, considering optimistic updates)
                    let lastNote = "";
                    let lastWeek = 0;
                    for (const ws of priority.weeklyStatuses) {
                      const n = getWeekNote(priority, ws.weekNumber);
                      if (n && ws.weekNumber > lastWeek) {
                        lastNote = n;
                        lastWeek = ws.weekNumber;
                      }
                    }
                    // Also check any optimistic-only notes (not in weeklyStatuses)
                    const optNotes = optimisticNotes[priority.id] ?? {};
                    for (const [wStr, n] of Object.entries(optNotes)) {
                      const w = parseInt(wStr, 10);
                      if (n && w > lastWeek) {
                        lastNote = n;
                        lastWeek = w;
                      }
                    }
                    // Fall back to priority.notes (priority-level note) if no weekly notes
                    if (!lastNote && priority.notes) lastNote = priority.notes;

                    return (
                      <td className={`z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit ${isColFrozen("lastNote") ? "sticky" : ""}`}
                        style={{
                          left: isColFrozen("lastNote") ? getLeftOffset("lastNote") : undefined,
                          width: 200,
                          minWidth: 200,
                          boxShadow: lastFrozenKey === "lastNote" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                        }}>
                        {lastNote ? (
                          <span className="text-xs text-gray-600 truncate block max-w-[188px]" title={lastNote}>
                            {lastWeek > 0 && <span className="text-gray-400 mr-1">W{lastWeek}:</span>}
                            {lastNote}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    );
                  })()}

                  {/* Week cells */}
                  {ALL_WEEKS.map(w => {
                    const inRange = isInRange(priority, w);
                    const status = getWeekStatus(priority, w);
                    const note = getWeekNote(priority, w);
                    const isOpen = openPicker?.priorityId === priority.id && openPicker?.weekNumber === w;

                    if (!inRange) {
                      return (
                        <td key={w} className="border-r border-gray-100 px-0 py-0 bg-gray-50" style={{ minWidth: 64, height: 34 }}>
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
                      <td key={w} className="relative border-r border-gray-100 px-0 py-0" style={{ minWidth: 64, height: 34 }}>
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
                            {isPastLocked ? (
                              <svg className="h-2.5 w-2.5 text-white/60" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                              </svg>
                            ) : status && (
                              <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
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
      </div>

      {/* Pagination footer (dashboard only) */}
      {paginationEnabled && (total as number) > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-white text-xs text-gray-500 flex-shrink-0">
          <span>
            Showing {((page as number) - 1) * (pageSize as number) + 1}–{Math.min((page as number) * (pageSize as number), total as number)} of {total} results
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange?.((page as number) - 1)}
              disabled={(page as number) === 1}
              className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <span>Page {page} of {totalPages}</span>
            <button
              onClick={() => onPageChange?.((page as number) + 1)}
              disabled={(page as number) >= totalPages}
              className="px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
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

      {/* Edit Modal */}
      {editPriority && (
        <PriorityLogModal
          priority={editPriority}
          onClose={() => setEditPriority(null)}
          onSuccess={() => { setEditPriority(null); onRefresh(); }}
        />
      )}
    </div>
  );
}
