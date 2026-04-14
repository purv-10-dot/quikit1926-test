"use client";

import { useState, useRef, useEffect } from "react";
import type { WWWItem } from "@/lib/types/www";
import { WWWPanel } from "./WWWPanel";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";
import { ColMenu } from "@/components/table/ColMenu";
import { BaseTooltip } from "@/components/ui/base-tooltip";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { toDateInputValue } from "@/lib/utils/dateUtils";

import {
  STATUS_PICKER_OPTIONS,
  statusCellBg,
  statusLabel,
} from "@/lib/constants/status";

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadgeColor(status: string): string {
  return statusCellBg(status) || "bg-gray-100 text-gray-400";
}

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return "—";
  }
}

// ── Shared text tooltip ───────────────────────────────────────────────────────

function TextTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <BaseTooltip width="w-80" className="p-3" content={text ? <p className="leading-relaxed whitespace-pre-wrap">{text}</p> : null}>
      {children}
    </BaseTooltip>
  );
}

// ── What tooltip ──────────────────────────────────────────────────────────────

function WhatTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return <TextTooltip text={text}>{children}</TextTooltip>;
}

// ── Status Picker popover ─────────────────────────────────────────────────────

interface StatusPickerProps {
  itemId: string;
  currentStatus: string;
  onSave: (id: string, status: string) => void;
  onClose: () => void;
}

function StatusPicker({ itemId, currentStatus, onSave, onClose }: StatusPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  return (
    <div
      ref={ref}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-52"
    >
      <div className="px-3 pt-3 pb-2 border-b border-gray-100">
        <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Set Status</p>
      </div>
      <div className="py-1">
        {STATUS_PICKER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => { onSave(itemId, opt.value); onClose(); }}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 transition-colors ${currentStatus === opt.value ? "bg-gray-50 font-semibold" : "hover:bg-gray-50"}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${opt.color}`} />
            {opt.label}
            {currentStatus === opt.value && (
              <svg className="ml-auto h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}
        <div className="border-t border-gray-100 mt-1">
          <button
            onClick={() => { onSave(itemId, ""); onClose(); }}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-500 transition-colors ${currentStatus === "" ? "bg-gray-50 font-semibold" : "hover:bg-gray-50"}`}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-white border border-gray-300" />
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Revised Date Picker popover ───────────────────────────────────────────────

interface DatePickerProps {
  itemId: string;
  currentDate: string; // ISO string or ""
  existingDates: string[];
  onSave: (id: string, date: string, allDates: string[]) => void;
  onClose: () => void;
}

function RevisedDatePicker({ itemId, currentDate, existingDates, onSave, onClose }: DatePickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(toDateInputValue(currentDate));
  useClickOutside(ref, onClose);

  function handleSave() {
    if (!value) return;
    const existing = existingDates ?? [];
    const last = existing[existing.length - 1];
    const allDates = last !== value ? [...existing, value] : existing;
    onSave(itemId, value, allDates);
    onClose();
  }

  function handleClear() {
    onSave(itemId, "", []);
    onClose();
  }

  return (
    <div
      ref={ref}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-56 p-3 space-y-2"
    >
      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Revised Date</p>
      <input
        type="date"
        value={value}
        onChange={e => setValue(e.target.value)}
        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
        autoFocus
      />
      <div className="flex gap-2">
        <button
          onClick={handleClear}
          className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Clear
        </button>
        <button
          onClick={handleSave}
          disabled={!value}
          className="flex-1 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors font-medium"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  items: WWWItem[];
  onRefresh: () => void;
  onSelectionChange?: (ids: Set<string>) => void;
  /** Columns to always hide on this instance (e.g. dashboard preview). Not persisted. */
  hideColumns?: string[];
  /** When true, all editing is disabled. */
  readOnly?: boolean;
  /** Limit the number of rows displayed. */
  maxRows?: number;
  /** Pagination controls — when all four are provided, a pagination footer is rendered. */
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (p: number) => void;
}

// Column keys: _cb, _log, _id (always visible+frozen) | who, when, what, revisedDate, status, notes
const WWW_COL_ORDER_FULL = ["_cb", "_log", "_id", "who", "when", "what", "revisedDate", "status", "notes"];
const WWW_COL_WIDTHS: Record<string, number> = {
  _cb: 40, _log: 40, _id: 50, who: 120, when: 110,
  what: 300, revisedDate: 120, status: 140, notes: 300,
};
const WWW_COL_LABELS: Record<string, string> = {
  who: "Who", when: "When", what: "What", revisedDate: "Revised Date", status: "Status", notes: "Notes",
};
const WWW_SORT_KEYS: Record<string, string> = {
  who: "who", when: "when", what: "what", revisedDate: "revisedDate", status: "status", notes: "notes",
};
const WWW_ALWAYS_VISIBLE = new Set(["_cb", "_log", "_id"]);
const WWW_ALWAYS_FROZEN = new Set(["_cb", "_log", "_id"]);
// Only who/when can be sticky-frozen (they're early in the order)
const WWW_FREEZABLE = new Set(["who", "when"]);

export function WWWTable({ items: itemsAll, onRefresh, onSelectionChange, hideColumns, readOnly, maxRows, page, pageSize, total, onPageChange }: Props) {
  const items = maxRows != null ? itemsAll.slice(0, maxRows) : itemsAll;
  const paginationEnabled = page != null && pageSize != null && total != null && onPageChange != null;
  const totalPages = paginationEnabled ? Math.max(1, Math.ceil((total as number) / (pageSize as number))) : 1;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editItem, setEditItem] = useState<WWWItem | null>(null);
  const [panelTab, setPanelTab] = useState<"edit" | "log">("edit");
  const [openStatusPicker, setOpenStatusPicker] = useState<string | null>(null);
  const [openDatePicker, setOpenDatePicker] = useState<string | null>(null);

  // Table preferences (persisted per user in DB)
  const { frozenCol, setFrozenCol, hiddenCols, hideCol, sort, setSort } = useTablePrefs("www");

  // Filter out hidden columns.
  // - Persisted `hiddenCols` cannot hide WWW_ALWAYS_VISIBLE cols
  // - Per-instance `hideColumns` prop CAN hide anything (dashboard preview)
  const instanceHides = new Set(hideColumns ?? []);
  const persistedHides = new Set(hiddenCols);
  const WWW_COL_ORDER = WWW_COL_ORDER_FULL.filter((c) => {
    if (instanceHides.has(c)) return false;
    if (WWW_ALWAYS_VISIBLE.has(c)) return true;
    return !persistedHides.has(c);
  });
  const hiddenSet = new Set([...persistedHides, ...instanceHides]);

  const frozenIdx = frozenCol ? WWW_COL_ORDER.indexOf(frozenCol) : -1;
  const isColFrozen = (colKey: string) => {
    if (WWW_ALWAYS_FROZEN.has(colKey)) return true;
    if (frozenIdx < 0) return false;
    return WWW_COL_ORDER.indexOf(colKey) <= frozenIdx;
  };
  const getLeftOffset = (colKey: string): number => {
    let left = 0;
    for (const c of WWW_COL_ORDER) {
      if (c === colKey) return left;
      if (isColFrozen(c)) left += WWW_COL_WIDTHS[c];
    }
    return left;
  };
  const lastFrozenKey = (() => {
    let last = "_id";
    for (const c of WWW_COL_ORDER) if (isColFrozen(c)) last = c;
    return last;
  })();

  const [sortCol, sortDir] = sort ? (sort.split(":") as [string, "asc" | "desc"]) : [null, null];
  const handleSort = (colKey: string, dir: "asc" | "desc") => setSort(`${colKey}:${dir}`);
  const handleFreezeCol = (colKey: string) => setFrozenCol(frozenCol === colKey ? null : colKey);
  const handleHideCol = (colKey: string) => hideCol(colKey);

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
    const next = selectedIds.size === items.length ? new Set<string>() : new Set(items.map(i => i.id));
    setSelectedIds(next);
    onSelectionChange?.(next);
  }

  async function handleStatusSave(id: string, status: string) {
    try {
      await fetch(`/api/www/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      onRefresh();
    } catch {
      // ignore
    }
  }

  async function handleRevisedDateSave(id: string, _date: string, allDates: string[]) {
    try {
      await fetch(`/api/www/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisedDates: allDates }),
      });
      onRefresh();
    } catch {
      // ignore
    }
  }

  const thBase = "sticky top-0 z-20 bg-accent-50 border-b border-gray-200 border-r border-r-gray-100 text-left px-2 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap";

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <table className="border-collapse w-full">
          <thead>
            <tr className="bg-accent-50 border-b border-gray-200">
              {WWW_COL_ORDER.map((colKey) => {
                const frozen = isColFrozen(colKey);
                const width = WWW_COL_WIDTHS[colKey];
                const label =
                  colKey === "_cb" ? "" :
                  colKey === "_log" ? "" :
                  colKey === "_id" ? "ID" :
                  WWW_COL_LABELS[colKey] ?? "";
                const showMenu = !WWW_ALWAYS_FROZEN.has(colKey);
                const isBoundary = frozen && colKey === lastFrozenKey;
                const sortKey = WWW_SORT_KEYS[colKey];
                const isSorted = sortKey && sortCol === sortKey;
                const canFreeze = WWW_FREEZABLE.has(colKey);

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
                        checked={selectedIds.size === items.length && items.length > 0}
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
                            onFreeze={canFreeze ? () => handleFreezeCol(colKey) : undefined}
                            onHide={() => handleHideCol(colKey)}
                            frozen={frozen}
                            showSort={!!sortKey}
                            showFreeze={canFreeze}
                          />
                        )}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-xs text-gray-400">
                  No WWW items found
                </td>
              </tr>
            )}
            {items.map((item, rowIdx) => {
              const rowBg = rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50";
              const whoName = item.who_user
                ? `${item.who_user.firstName} ${item.who_user.lastName}`
                : "—";
              const lastRevisedDate = item.revisedDates?.length
                ? item.revisedDates[item.revisedDates.length - 1]
                : null;
              const isStatusPickerOpen = openStatusPicker === item.id;
              const isDatePickerOpen = openDatePicker === item.id;

              return (
                <tr
                  key={item.id}
                  className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${rowBg}`}
                >
                  {/* Checkbox — always frozen (hidable only via hideColumns prop) */}
                  {WWW_COL_ORDER.includes("_cb") && (
                    <td className="sticky z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit" style={{ left: getLeftOffset("_cb"), width: 40, minWidth: 40 }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="rounded border-gray-300 text-blue-600 cursor-pointer"
                      />
                    </td>
                  )}

                  {/* Log icon — always frozen (hidable only via hideColumns prop) */}
                  {WWW_COL_ORDER.includes("_log") && (
                    <td className="sticky z-20 border-r border-gray-100 px-1 py-1.5 text-center bg-inherit" style={{ left: getLeftOffset("_log"), width: 40, minWidth: 40 }}>
                      <button
                        onClick={() => { setPanelTab("log"); setEditItem(item); }}
                        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
                        title="Open log"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    </td>
                  )}

                  {/* ID — always frozen (hidable only via hideColumns prop) */}
                  {WWW_COL_ORDER.includes("_id") && (
                    <td className="sticky z-20 border-r border-gray-100 px-1 py-1.5 text-center bg-inherit"
                      style={{
                        left: getLeftOffset("_id"),
                        width: 50,
                        minWidth: 50,
                        boxShadow: lastFrozenKey === "_id" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      <button
                        onClick={() => { setPanelTab("edit"); setEditItem(item); }}
                        className="text-gray-900 hover:underline font-medium text-xs transition-colors"
                      >
                        {rowIdx + 1}
                      </button>
                    </td>
                  )}

                  {/* Who — user-freezable, hidable */}
                  {WWW_COL_ORDER.includes("who") && (
                    <td className={`z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit ${isColFrozen("who") ? "sticky" : ""}`}
                      style={{
                        left: isColFrozen("who") ? getLeftOffset("who") : undefined,
                        width: 120,
                        minWidth: 120,
                        boxShadow: lastFrozenKey === "who" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      <span className="text-xs text-gray-800 font-medium truncate block max-w-[108px]">
                        {whoName}
                      </span>
                    </td>
                  )}

                  {/* When — user-freezable, hidable */}
                  {WWW_COL_ORDER.includes("when") && (
                    <td className={`z-20 border-r border-gray-200 px-2 py-1.5 bg-inherit ${isColFrozen("when") ? "sticky" : ""}`}
                      style={{
                        left: isColFrozen("when") ? getLeftOffset("when") : undefined,
                        width: 110,
                        minWidth: 110,
                        boxShadow: lastFrozenKey === "when" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                      }}>
                      <div className="flex items-center gap-1">
                        <svg className="h-3 w-3 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className={`text-xs ${item.when ? "text-blue-600" : "text-gray-400"}`}>
                          {formatDate(item.when)}
                        </span>
                      </div>
                    </td>
                  )}

                  {/* What — hidable */}
                  {WWW_COL_ORDER.includes("what") && (
                    <td className="border-r border-gray-100 px-2 py-1.5" style={{ width: 300, minWidth: 300 }}>
                      <WhatTooltip text={item.what}>
                        <p className="text-xs text-gray-800 line-clamp-2 max-w-[288px] cursor-default">
                          {item.what}
                        </p>
                      </WhatTooltip>
                    </td>
                  )}

                  {/* Revised Date — inline editable, hidable */}
                  {WWW_COL_ORDER.includes("revisedDate") && (
                    <td className="relative border-r border-gray-100 px-2 py-1.5" style={{ width: 120, minWidth: 120 }}>
                      <button
                        onClick={() => {
                          if (readOnly) return;
                          setOpenStatusPicker(null);
                          setOpenDatePicker(isDatePickerOpen ? null : item.id);
                        }}
                        disabled={readOnly}
                        className={`flex items-center gap-1 group ${readOnly ? "cursor-default" : ""}`}
                      >
                        {lastRevisedDate ? (
                          <>
                            <svg className="h-3 w-3 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className={`text-xs text-blue-600 ${!readOnly ? "group-hover:underline" : ""}`}>{formatDate(lastRevisedDate)}</span>
                          </>
                        ) : (
                          <span className={`text-xs text-gray-300 ${!readOnly ? "group-hover:text-gray-500" : ""}`}>—</span>
                        )}
                      </button>
                      {isDatePickerOpen && !readOnly && (
                        <RevisedDatePicker
                          itemId={item.id}
                          currentDate={lastRevisedDate ?? ""}
                          existingDates={item.revisedDates ?? []}
                          onSave={handleRevisedDateSave}
                          onClose={() => setOpenDatePicker(null)}
                        />
                      )}
                    </td>
                  )}

                  {/* Status — hidable */}
                  {WWW_COL_ORDER.includes("status") && (
                    <td className={`relative border-r border-gray-100 ${statusBadgeColor(item.status)}`} style={{ width: 140, minWidth: 140 }}>
                      <button
                        onClick={() => {
                          if (readOnly) return;
                          setOpenDatePicker(null);
                          setOpenStatusPicker(isStatusPickerOpen ? null : item.id);
                        }}
                        disabled={readOnly}
                        className={`w-full h-full flex items-center justify-center px-2 py-3 text-[10px] font-semibold whitespace-nowrap ${readOnly ? "cursor-default" : ""}`}
                      >
                        {statusLabel(item.status)}
                      </button>
                      {isStatusPickerOpen && !readOnly && (
                        <StatusPicker
                          itemId={item.id}
                          currentStatus={item.status}
                          onSave={handleStatusSave}
                          onClose={() => setOpenStatusPicker(null)}
                        />
                      )}
                    </td>
                  )}

                  {/* Notes — hidable */}
                  {WWW_COL_ORDER.includes("notes") && (
                    <td className="border-r border-gray-100 px-2 py-1.5" style={{ minWidth: 300, width: "100%" }}>
                      <TextTooltip text={item.notes ?? ""}>
                        <span className="text-xs text-gray-600 truncate block cursor-default">
                          {item.notes || <span className="text-gray-300">—</span>}
                        </span>
                      </TextTooltip>
                    </td>
                  )}
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

      {editItem && (
        <WWWPanel
          mode="edit"
          item={editItem}
          initialTab={panelTab}
          onClose={() => setEditItem(null)}
          onSuccess={() => { setEditItem(null); onRefresh(); }}
        />
      )}
    </div>
  );
}
