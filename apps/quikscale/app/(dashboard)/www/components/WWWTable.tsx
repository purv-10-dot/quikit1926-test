"use client";

import { useState, useRef, useEffect, useMemo, useCallback, type UIEvent } from "react";
import { useSession } from "next-auth/react";
import { ROLES, ROLE_HIERARCHY } from "@quikit/shared";
import type { WWWItem } from "@/lib/types/www";
import { WWWPanel } from "./WWWPanel";
import { WWWChangeHistoryPanel } from "./WWWChangeHistoryPanel";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";
import { useTableSort } from "@/lib/store";
import { SortIndicator } from "@/components/table/SortIndicator";
import { ColMenu } from "@/components/table/ColMenu";
import { HorizontalScroller } from "@/components/ui/HorizontalScroller";
import { isNearBottom } from "@/lib/utils/scroll";
import { useColumnResize, ResizeHandle } from "@/lib/hooks/useColumnResize";
import { useColumnOrder } from "@/lib/hooks/useColumnOrder";
import { moveByKey, columnsUnfrozenBy } from "@/lib/utils/columnOrder";
import { useColumnDnD, DragHandle } from "@/lib/hooks/useColumnDnD";
import { BaseTooltip } from "@/components/ui/base-tooltip";
import { UserAuditCell, DateAuditCell } from "@/components/table/AuditCells";
import { useClickOutside } from "@/lib/hooks/useClickOutside";
import { toDateInputValue } from "@/lib/utils/dateUtils";
import { Pagination, useConfirm } from "@quikit/ui";
import { notify } from "@/lib/utils/notify";

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

// ── Notes cell ────────────────────────────────────────────────────────────────
// Fixed-height (~3 lines), vertically-scrollable note box — the same pattern the
// Individual KPI ("Last Notes") and Priority tables use, so a long note shows a
// thin scrollbar inside the cell instead of being clipped to 2 lines (the old
// `line-clamp-2`) or stretching the row. Native `title` shows the full note on
// hover. Empty → em dash.
export function ScrollableNote({ text }: { text: string | null | undefined }) {
  const t = text ?? "";
  if (!t) return <span className="text-gray-300">—</span>;
  return (
    <div
      className="text-xs text-gray-600 max-h-[3.25rem] overflow-y-auto leading-snug break-words pr-1 cursor-default"
      style={{ scrollbarWidth: "thin" }}
      title={t}
    >
      {t}
    </div>
  );
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
        {/* The "Clear" entry is already in STATUS_PICKER_OPTIONS (last item,
            value=""), so the previously-rendered manual <button> here
            produced a duplicate row. Removed — keep the picker in lockstep
            with the shared options used by PriorityTable. */}
      </div>
    </div>
  );
}

// ── Revised Date Picker popover ───────────────────────────────────────────────

interface DatePickerProps {
  itemId: string;
  currentDate: string; // ISO string or ""
  existingDates: string[];
  /** Earliest allowed date — typically the item's `when` (ISO). Below this is disabled. */
  minDate?: string;
  onSave: (id: string, date: string, allDates: string[]) => void;
  onClose: () => void;
}

function RevisedDatePicker({ itemId, currentDate, existingDates, minDate, onSave, onClose }: DatePickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(toDateInputValue(currentDate));
  const [error, setError] = useState<string>("");
  useClickOutside(ref, onClose);

  const minDateInput = minDate ? toDateInputValue(minDate) : undefined;

  function handleSave() {
    if (!value) return;
    if (minDateInput && value < minDateInput) {
      setError(`Must be on or after ${minDateInput}`);
      return;
    }
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
        min={minDateInput}
        onChange={e => { setValue(e.target.value); setError(""); }}
        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
        autoFocus
      />
      {minDateInput && (
        <p className="text-[9px] text-gray-400">Min: {minDateInput}</p>
      )}
      {error && <p className="text-[10px] text-red-500">{error}</p>}
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

// ── Notes Picker popover ──────────────────────────────────────────────────────
// Inline editor for the single `notes` string shown in the grid — mirrors the
// StatusPicker / RevisedDatePicker pattern so Notes can be entered directly from
// the grid instead of only via the create form. Save is routed through the
// parent (`onSave`) which closes the popover on success and surfaces the
// server's `www_notes_required` error on failure (popover stays open).
interface NotesPickerProps {
  itemId: string;
  currentNotes: string;
  onSave: (id: string, notes: string) => void;
  onClose: () => void;
}

function NotesPicker({ itemId, currentNotes, onSave, onClose }: NotesPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState(currentNotes);
  useClickOutside(ref, onClose);

  return (
    <div
      ref={ref}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-64 p-3 space-y-2"
    >
      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Note</p>
      <textarea
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Add a note…"
        rows={3}
        autoFocus
        className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
      />
      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave(itemId, value)}
          className="flex-1 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
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
  onPageSizeChange?: (size: number) => void;
  /** RBAC v2 — false disables row checkboxes + toasts. Defaults to true. */
  canDelete?: boolean;
  /** RBAC v2 — false makes opened edit drawers read-only. Defaults to true. */
  canUpdate?: boolean;
  /** Controlled sort override. When `onSort` is provided the table uses these
   *  props (backend sort keys, e.g. "who") for the header indicator and routes
   *  clicks through `onSort` instead of its internal Redux store. Used by the
   *  Dashboard for independent DB-level sort. Omit to keep Redux-backed sort. */
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

// Column keys: _cb, _log, _id (always visible+frozen) | who, when, what, revisedDate, status, notes
// Rail columns are never reorderable; the rest are user-draggable + persisted.
const WWW_RAIL_COLS = ["_cb", "_log", "_id"] as const;
const WWW_DEFAULT_NON_RAIL = [
  "who", "when", "what", "revisedDate", "status", "category", "notes",
  // Audit columns — appended at the end.
  "createdBy", "updatedBy", "createdAt", "updatedAt",
];
const WWW_COL_WIDTHS: Record<string, number> = {
  _cb: 40, _log: 40, _id: 50, who: 120, when: 110,
  what: 300, revisedDate: 120, status: 140, category: 110, notes: 300,
  createdBy: 160, updatedBy: 160, createdAt: 130, updatedAt: 130,
};
const WWW_COL_LABELS: Record<string, string> = {
  who: "Who", when: "When", what: "What", revisedDate: "Revised Date", status: "Status", category: "Category", notes: "Notes",
  createdBy: "Created By", updatedBy: "Updated By",
  createdAt: "Created Date", updatedAt: "Updated Date",
};
const WWW_SORT_KEYS: Record<string, string> = {
  who: "who", when: "when", what: "what", revisedDate: "revisedDate", status: "status", category: "category", notes: "notes",
};
const WWW_ALWAYS_VISIBLE = new Set(["_cb", "_log", "_id"]);
const WWW_ALWAYS_FROZEN = new Set(["_cb", "_log", "_id"]);
// Only who/when can be sticky-frozen (they're early in the order)
const WWW_FREEZABLE = new Set(["who", "when"]);

export function WWWTable({ items: itemsAll, onRefresh, onSelectionChange, hideColumns, readOnly, maxRows, page, pageSize, total, onPageChange, onPageSizeChange, canDelete = true, canUpdate = true, sortBy: sortByProp, sortOrder: sortOrderProp, onSort: onSortProp, maxBodyHeight, hasMore, isFetchingMore, onLoadMore }: Props) {
  const items = maxRows != null ? itemsAll.slice(0, maxRows) : itemsAll;
  // Infinite-scroll mode: bounded-height body whose vertical scroll loads more.
  const infiniteMode = maxBodyHeight != null;
  const handleBodyScroll = (e: UIEvent<HTMLDivElement>) => {
    if (!infiniteMode || !hasMore || isFetchingMore) return;
    if (isNearBottom(e.currentTarget)) onLoadMore?.();
  };
  const paginationEnabled = page != null && pageSize != null && total != null && onPageChange != null;
  const totalPages = paginationEnabled ? Math.max(1, Math.ceil((total as number) / (pageSize as number))) : 1;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editItem, setEditItem] = useState<WWWItem | null>(null);
  const [panelTab, setPanelTab] = useState<"edit" | "log">("edit");
  // Separate state for logs-only panel (triggered by the log icon).
  const [logItem, setLogItem] = useState<WWWItem | null>(null);
  const [openStatusPicker, setOpenStatusPicker] = useState<string | null>(null);
  const [openDatePicker, setOpenDatePicker] = useState<string | null>(null);
  const [openNotesPicker, setOpenNotesPicker] = useState<string | null>(null);

  // Per-item edit permission: creator, assignee, admin role, or super-admin.
  // Mirrors the server-side `canEditWWW` helper (source of truth).
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";
  const isAdminActor = (() => {
    const role = (session?.user as { membershipRole?: string } | undefined)?.membershipRole;
    if (role && (ROLE_HIERARCHY[role] ?? 0) >= ROLE_HIERARCHY[ROLES.ADMIN]) return true;
    if ((session?.user as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin) return true;
    return false;
  })();
  function canEditItem(item: WWWItem): boolean {
    if (isAdminActor) return true;
    return item.createdBy === currentUserId || item.who === currentUserId;
  }

  // Freeze + hidden cols stay in the DB-backed user pref. Sort moved to the
  // global Redux tables slice (lib/store) so it shares the same persistence
  // pattern as KPI and Priority. The "sort" / "setSort" fields on
  // useTablePrefs are intentionally unused here.
  const { frozenCol, setFrozenCol, hiddenCols, hideCol } = useTablePrefs("www");
  const { sortBy: redSortBy, sortOrder: redSortOrder, setSort: setRedSort } = useTableSort("www");
  // Controlled-sort override (Dashboard) wins over the Redux store. Keeps the
  // /www page Redux-backed while letting the Dashboard sort independently.
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

  // Per-user drag-and-drop order of the non-rail columns.
  const {
    orderedCols: orderedNonRail,
    applyOrder: applyColumnOrder,
  } = useColumnOrder("www", WWW_DEFAULT_NON_RAIL, { alwaysFrozen: WWW_RAIL_COLS });
  const WWW_COL_ORDER_FULL = useMemo(
    () => [...WWW_RAIL_COLS, ...orderedNonRail],
    [orderedNonRail],
  );

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
  // Drag-to-resize: persisted widths override WWW_COL_WIDTHS defaults.
  const { getColWidth, startResize } = useColumnResize("www", WWW_COL_WIDTHS);
  const getLeftOffset = (colKey: string): number => {
    let left = 0;
    for (const c of WWW_COL_ORDER) {
      if (c === colKey) return left;
      if (isColFrozen(c)) left += getColWidth(c);
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

  // ── Drag-to-reorder columns ─────────────────────────────────────────────
  const headerRowRef = useRef<HTMLTableRowElement>(null);
  const confirm = useConfirm();
  // Previews opt out via layout flags (readOnly / maxRows / maxBodyHeight).
  // `hideColumns` is NOT a preview signal, so it must not gate reordering.
  const reorderDisabled = !!readOnly || maxRows != null || maxBodyHeight != null;
  const canReorderCol = useCallback(
    (col: string) => !reorderDisabled && orderedNonRail.includes(col),
    [reorderDisabled, orderedNonRail],
  );
  const handleColDrop = useCallback(
    async (fromKey: string, toKey: string, side: "before" | "after") => {
      const nextNonRail = moveByKey(orderedNonRail, fromKey, toKey, side);
      const nextFull = [...WWW_RAIL_COLS, ...nextNonRail];
      const curFull = [...WWW_RAIL_COLS, ...orderedNonRail];
      const unfrozen = columnsUnfrozenBy(curFull, nextFull, frozenCol, WWW_RAIL_COLS);
      if (unfrozen.length > 0) {
        const ok = await confirm({
          tone: "warning",
          title: "Unfreeze column?",
          description:
            "Moving this column will remove it from the frozen (pinned) section. Are you sure you want to continue?",
          confirmLabel: "Yes, move it",
          cancelLabel: "No",
        });
        if (!ok) return;
      }
      applyColumnOrder(nextNonRail);
    },
    [orderedNonRail, frozenCol, applyColumnOrder, confirm],
  );
  const dnd = useColumnDnD({
    getHeaderRow: () => headerRowRef.current,
    onDrop: handleColDrop,
    canReorder: canReorderCol,
  });
  function dropIndicatorClass(col: string) {
    if (dnd.overKey !== col || !dnd.dropSide) return "";
    return dnd.dropSide === "before"
      ? "shadow-[inset_2px_0_0_0_var(--tw-shadow-color)] shadow-blue-500"
      : "shadow-[inset_-2px_0_0_0_var(--tw-shadow-color)] shadow-blue-500";
  }

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

  async function handleNotesSave(id: string, notes: string) {
    try {
      const res = await fetch(`/api/www/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        // Surface the server error (e.g. the `www_notes_required` "Notes are
        // required." 400) and keep the popover open so the edit isn't lost.
        notify.error(json?.error || "Failed to update notes");
        return;
      }
      setOpenNotesPicker(null);
      onRefresh();
    } catch {
      notify.error("Failed to update notes");
    }
  }

  const thBase = "sticky top-0 z-20 bg-accent-50 border-b border-gray-200 border-r border-r-gray-100 text-left px-2 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap";

  return (
    <div className="flex flex-col h-full">
      <HorizontalScroller
        className="flex-1"
        innerStyle={infiniteMode ? { maxHeight: maxBodyHeight } : undefined}
        showVerticalScrollbar={infiniteMode}
        onContentScroll={infiniteMode ? handleBodyScroll : undefined}
      >
        <table className="border-collapse w-full" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr ref={headerRowRef} className="bg-accent-50 border-b border-gray-200">
              {WWW_COL_ORDER.map((colKey) => {
                const frozen = isColFrozen(colKey);
                const width = getColWidth(colKey);
                const isAlwaysFrozen = WWW_ALWAYS_FROZEN.has(colKey);
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
                const isDragging = dnd.draggingKey === colKey;

                return (
                  <th key={colKey}
                    data-col-key={colKey}
                    className={`group relative top-0 z-30 bg-accent-50 border-b border-gray-200 border-r border-r-gray-200 text-left px-2 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap select-none ${frozen ? "sticky" : ""} ${dropIndicatorClass(colKey)} ${isDragging ? "opacity-40" : ""}`}
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
                          checked={selectedIds.size === items.length && items.length > 0}
                          onChange={toggleAll} disabled={!canDelete}
                          className={`rounded border-gray-300 text-blue-600 ${canDelete ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`} />
                      </label>
                    ) : (
                      <div className="flex items-center justify-between gap-1">
                        <span className="inline-flex items-center gap-1">
                          {!reorderDisabled && <DragHandle onStart={(e) => dnd.startDrag(colKey, e)} />}
                          {frozenCol === colKey && (
                            <svg className="h-3 w-3 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          {/* `title` surfaces the full label as a native tooltip
                              when the column is narrow enough to ellipsize
                              (common on Dashboard previews). The label is also a
                              drag handle for reorderable columns. */}
                          <span
                            title={label}
                            onPointerDown={!reorderDisabled && orderedNonRail.includes(colKey) ? (e) => dnd.startDrag(colKey, e) : undefined}
                            className={`${isSorted ? "text-accent-700" : ""} ${!reorderDisabled && orderedNonRail.includes(colKey) ? "cursor-grab active:cursor-grabbing touch-none" : ""}`}
                          >{label}</span>
                          <SortIndicator active={!!isSorted} direction={sortDir} />
                        </span>
                        {showMenu && (
                          <ColMenu
                            colKey={colKey}
                            onSort={sortKey ? (dir) => handleSort(sortKey, dir) : undefined}
                            activeSort={isSorted ? sortDir : null}
                            onClearSort={sortKey ? () => setSort(null) : undefined}
                            onFreeze={canFreeze ? () => handleFreezeCol(colKey) : undefined}
                            onHide={() => handleHideCol(colKey)}
                            frozen={frozen}
                            showSort={!!sortKey}
                            showFreeze={canFreeze}
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
              // Effective lock for this row: instance-level readOnly prop OR lack of permission
              const rowLocked = !!readOnly || !canEditItem(item);
              const whoName = item.who_user
                ? `${item.who_user.firstName} ${item.who_user.lastName}`
                : "—";
              const lastRevisedDate = item.revisedDates?.length
                ? item.revisedDates[item.revisedDates.length - 1]
                : null;
              const isStatusPickerOpen = openStatusPicker === item.id;
              const isDatePickerOpen = openDatePicker === item.id;
              const isNotesPickerOpen = openNotesPicker === item.id;

              // Render one body cell by column key, in the user's drag order.
              // Cell styling is byte-identical to the previous hardcoded blocks.
              const renderBodyCell = (colKey: string) => {
                switch (colKey) {
                  case "_cb":
                    return (
                      <td key={colKey} className="sticky z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit" style={{ left: getLeftOffset("_cb"), width: 40, minWidth: 40 }}>
                        <label
                          onClickCapture={(e) => {
                            if (!canDelete) {
                              e.preventDefault();
                              e.stopPropagation();
                              notify.error("You don't have permission to delete");
                            }
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)} disabled={!canDelete}
                            className={`rounded border-gray-300 text-blue-600 ${canDelete ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}
                          />
                        </label>
                      </td>
                    );
                  case "_log":
                    return (
                      <td key={colKey} className="sticky z-20 border-r border-gray-100 px-1 py-1.5 text-center bg-inherit" style={{ left: getLeftOffset("_log"), width: 40, minWidth: 40 }}>
                        <button
                          onClick={() => setLogItem(item)}
                          className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
                          title="Open log"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      </td>
                    );
                  case "_id":
                    return (
                      <td key={colKey} className="sticky z-20 border-r border-gray-100 px-1 py-1.5 text-center bg-inherit"
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
                    );
                  case "who":
                    return (
                      <td key={colKey} className={`z-20 border-r border-gray-100 px-2 py-1.5 bg-inherit ${isColFrozen("who") ? "sticky" : ""}`}
                        style={{
                          left: isColFrozen("who") ? getLeftOffset("who") : undefined,
                          width: getColWidth("who"),
                          minWidth: getColWidth("who"),
                          boxShadow: lastFrozenKey === "who" ? "2px 0 4px -1px rgba(0,0,0,0.08)" : undefined,
                        }}>
                        <span className="text-xs text-gray-800 font-medium truncate block">
                          {whoName}
                        </span>
                      </td>
                    );
                  case "when":
                    return (
                      <td key={colKey} className={`z-20 border-r border-gray-200 px-2 py-1.5 bg-inherit ${isColFrozen("when") ? "sticky" : ""}`}
                        style={{
                          left: isColFrozen("when") ? getLeftOffset("when") : undefined,
                          width: getColWidth("when"),
                          minWidth: getColWidth("when"),
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
                    );
                  case "what":
                    return (
                      <td key={colKey} className="border-r border-gray-100 px-2 py-1.5 overflow-hidden align-top" style={{ width: getColWidth("what"), minWidth: getColWidth("what") }}>
                        <WhatTooltip text={item.what}>
                          <p className="text-xs text-gray-800 line-clamp-2 leading-snug break-words cursor-default">
                            {item.what}
                          </p>
                        </WhatTooltip>
                      </td>
                    );
                  case "revisedDate":
                    return (
                      <td key={colKey} className="relative border-r border-gray-100 px-2 py-1.5" style={{ width: getColWidth("revisedDate"), minWidth: getColWidth("revisedDate") }}>
                        <button
                          onClick={() => {
                            if (rowLocked) return;
                            setOpenStatusPicker(null);
                            setOpenNotesPicker(null);
                            setOpenDatePicker(isDatePickerOpen ? null : item.id);
                          }}
                          disabled={rowLocked}
                          title={rowLocked && !readOnly ? "Only the creator, assignee, or an admin can edit this item" : undefined}
                          className={`flex items-center gap-1 group ${rowLocked ? "cursor-default" : ""}`}
                        >
                          {lastRevisedDate ? (
                            <>
                              <svg className="h-3 w-3 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className={`text-xs text-blue-600 ${!rowLocked ? "group-hover:underline" : ""}`}>{formatDate(lastRevisedDate)}</span>
                            </>
                          ) : (
                            <span className={`text-xs text-gray-300 ${!rowLocked ? "group-hover:text-gray-500" : ""}`}>—</span>
                          )}
                        </button>
                        {isDatePickerOpen && !rowLocked && (
                          <RevisedDatePicker
                            itemId={item.id}
                            currentDate={lastRevisedDate ?? ""}
                            existingDates={item.revisedDates ?? []}
                            minDate={item.when}
                            onSave={handleRevisedDateSave}
                            onClose={() => setOpenDatePicker(null)}
                          />
                        )}
                      </td>
                    );
                  case "status":
                    return (
                      <td key={colKey} className={`relative border-r border-gray-100 ${statusBadgeColor(item.status)}`} style={{ width: getColWidth("status"), minWidth: getColWidth("status") }}>
                        <button
                          onClick={() => {
                            if (rowLocked) return;
                            setOpenDatePicker(null);
                            setOpenNotesPicker(null);
                            setOpenStatusPicker(isStatusPickerOpen ? null : item.id);
                          }}
                          disabled={rowLocked}
                          title={rowLocked && !readOnly ? "Only the creator, assignee, or an admin can edit this item" : undefined}
                          className={`w-full h-full flex items-center justify-center px-2 py-3 text-[10px] font-semibold whitespace-nowrap ${rowLocked ? "cursor-default" : ""}`}
                        >
                          {statusLabel(item.status)}
                        </button>
                        {isStatusPickerOpen && !rowLocked && (
                          <StatusPicker
                            itemId={item.id}
                            currentStatus={item.status}
                            onSave={handleStatusSave}
                            onClose={() => setOpenStatusPicker(null)}
                          />
                        )}
                      </td>
                    );
                  case "category":
                    return (
                      <td key={colKey} className="border-r border-gray-100 px-2 py-1.5 overflow-hidden align-top" style={{ width: getColWidth("category"), minWidth: getColWidth("category") }}>
                        {item.category ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700">
                            {item.category}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    );
                  case "notes":
                    return (
                      <td key={colKey} className="relative border-r border-gray-100 px-2 py-1.5 align-top" style={{ width: getColWidth("notes"), minWidth: getColWidth("notes") }}>
                        <button
                          onClick={() => {
                            if (rowLocked) return;
                            setOpenStatusPicker(null);
                            setOpenDatePicker(null);
                            setOpenNotesPicker(isNotesPickerOpen ? null : item.id);
                          }}
                          disabled={rowLocked}
                          title={rowLocked && !readOnly ? "Only the creator, assignee, or an admin can edit this item" : undefined}
                          className={`w-full text-left rounded ${rowLocked ? "cursor-default" : "hover:bg-blue-50/40"}`}
                        >
                          <ScrollableNote text={item.notes} />
                        </button>
                        {isNotesPickerOpen && !rowLocked && (
                          <NotesPicker
                            itemId={item.id}
                            currentNotes={item.notes ?? ""}
                            onSave={handleNotesSave}
                            onClose={() => setOpenNotesPicker(null)}
                          />
                        )}
                      </td>
                    );
                  case "createdBy":
                    return (
                      <td key={colKey} className="border-r border-gray-100 px-3 py-1.5 align-top" style={{ width: getColWidth("createdBy"), minWidth: getColWidth("createdBy") }}>
                        <UserAuditCell name={item.createdByName} initials={item.createdByInitials} />
                      </td>
                    );
                  case "updatedBy":
                    return (
                      <td key={colKey} className="border-r border-gray-100 px-3 py-1.5 align-top" style={{ width: getColWidth("updatedBy"), minWidth: getColWidth("updatedBy") }}>
                        <UserAuditCell name={item.updatedByName} initials={item.updatedByInitials} />
                      </td>
                    );
                  case "createdAt":
                    return (
                      <td key={colKey} className="border-r border-gray-100 px-3 py-1.5 align-top" style={{ width: getColWidth("createdAt"), minWidth: getColWidth("createdAt") }}>
                        <DateAuditCell iso={item.createdAt} />
                      </td>
                    );
                  case "updatedAt":
                    return (
                      <td key={colKey} className="border-r border-gray-100 px-3 py-1.5 align-top" style={{ width: getColWidth("updatedAt"), minWidth: getColWidth("updatedAt") }}>
                        <DateAuditCell iso={item.updatedAt} />
                      </td>
                    );
                  default:
                    return null;
                }
              };

              return (
                <tr
                  key={item.id}
                  className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${rowBg}`}
                >
                  {/* Cells rendered in the user's drag order (see renderBodyCell).
                      Styling/colors unchanged from the previous hardcoded blocks. */}
                  {WWW_COL_ORDER.map(renderBodyCell)}
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

      {editItem && (
        <WWWPanel
          mode="edit"
          item={editItem}
          initialTab={panelTab}
          onClose={() => setEditItem(null)}
          onSuccess={() => { setEditItem(null); onRefresh(); }}
          canUpdate={canUpdate}
        />
      )}

      {/* Change-history panel — full audit timeline (triggered by log icon) */}
      {logItem && (
        <WWWChangeHistoryPanel
          item={logItem}
          onClose={() => setLogItem(null)}
        />
      )}
    </div>
  );
}
