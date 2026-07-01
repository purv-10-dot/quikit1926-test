"use client";

import { useState, useRef, useEffect, useMemo, CSSProperties } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useSession } from "next-auth/react";
import { useDashboardSummary } from "@/lib/hooks/useDashboardSummary";
import {
  useInfiniteKPIs,
  useInfinitePriorities,
  useInfiniteWWW,
  type ListFilters,
} from "@/lib/hooks/useInfiniteDashboardLists";
import { useFilterContext } from "@/lib/context/FilterContext";
import { FilterPicker, userToFilterOption, FiscalPeriodPicker, type FiscalQuarter } from "@quikit/ui";
import { useFiscalYears } from "@/lib/hooks/useFiscalYears";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import { useDisabledModules } from "@/lib/hooks/useFeatureFlagsForApp";
import { useTeams } from "@/lib/hooks/useTeams";
import { useUsers } from "@/lib/hooks/useUsers";
import { useInfiniteUsers } from "@/lib/hooks/useInfiniteUsers";
import { HistoryButton } from "@/components/audit/HistoryButton";
import { UnreadCountsProvider } from "@/components/audit/UnreadCountsProvider";
import { ChangeHistoryPanel } from "@/app/(dashboard)/kpi/components/ChangeHistoryPanel";
import { useSessionState } from "@/lib/hooks/useSessionState";
import { STATUS_DOT, ITEM_STATUS_ORDER, statusLabel as getStatusLabel, type ItemStatus } from "@/lib/constants/status";
import type { KPIRow } from "@/lib/types/kpi";
import type { PriorityRow } from "@/lib/types/priority";
import type { WWWItem } from "@/lib/types/www";
import {
  getFiscalYear, getFiscalQuarter, fiscalYearLabel,
  weekDateLabel, ALL_WEEKS, weeksArray, rollingVisibleWeeks,
} from "@/lib/utils/fiscal";
import { useCurrentWeek, useWeekDateRange, useWeekLabels, useQuarterWeekCount } from "@/lib/hooks/useCurrentWeek";
import { progressColor, weekCellColors, fmt, fmtCompact, formatScaledKpiValue, getProgressBadgeColors, getLatestWeeklyNote, type NumberFormat } from "@/lib/utils/kpiHelpers";
import { useNumberFormat } from "@/lib/hooks/useFeatureFlags";
import { getLatestPriorityNote } from "@/lib/utils/priorityHelpers";
import { getColorByPercentage } from "@/lib/utils/colorLogic";
import { dashboardKpiHiddenColumns } from "@/lib/utils/dashboardColumns";
import { HorizontalScroller } from "@/components/ui/HorizontalScroller";
import { resolveProgressQtd, resolveProgressOverall, computeKpiOverviewStats, kpiOverviewVisible } from "../kpi/components/kpiStats";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";
import { HiddenColsPill } from "@/components/table/HiddenColsPill";
import { HiddenColsMenu } from "../kpi/components/HiddenColsMenu";
import { ALL_STATIC_COLS, COL_LABELS as KPI_COL_LABELS } from "../kpi/hooks/useTableColumns";
import { ALL_WEEKS as FISCAL_ALL_WEEKS } from "@/lib/utils/fiscal";
import { DashboardMoreActions, type DashboardSectionKey } from "./DashboardMoreActions";

// Debounce a fast-changing value (e.g. a search input) so it only drives a
// network query after the user pauses typing. Kept local to the dashboard so
// its table search stays independent of the Redux-backed module-page search.
function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// Compact search box for a dashboard table header. Controlled — the parent
// owns the raw input value and debounces it before it drives the DB query.
function TableSearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <svg className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-40 pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white text-gray-700"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── Lazy-loaded tables ──────────────────────────────────────────────────────
// KPI/Priority/WWW tables (+ their heavy edit modals) are code-split out of the
// dashboard's initial bundle. They render only after their data-loading guard
// (`xLoading ? <Spinner/> : <Table/>`), take plain props, and use no refs, so a
// dynamic boundary is behavior-equivalent — just async-loaded. The dashboard is
// already a client component, so no SSR is lost (`ssr: false`).
const TableChunkLoading = () => (
  <div className="h-40 w-full animate-pulse rounded-xl bg-gray-50" />
);
const KPITable = dynamic(
  () => import("../kpi/components/KPITable").then((m) => m.KPITable),
  { ssr: false, loading: TableChunkLoading },
);
const PriorityTable = dynamic(
  () => import("../priority/components/PriorityTable").then((m) => m.PriorityTable),
  { ssr: false, loading: TableChunkLoading },
);
const WWWTable = dynamic(
  () => import("../www/components/WWWTable").then((m) => m.WWWTable),
  { ssr: false, loading: TableChunkLoading },
);

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENT_YEAR = getFiscalYear();
const FISCAL_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

// Fixed body height for the dashboard's infinite-scroll tables — roughly 8–10
// rows including the sticky header. The body scrolls vertically within this cap
// so the dashboard layout height stays stable as more pages load.
const DASHBOARD_TABLE_MAX_HEIGHT = 470;

// Shared week column factory. The Dashboard limits visible data to a rolling
// 5-week window anchored at the current week (see rollingVisibleWeeks), so
// these columns are derived per-render from `visibleWeeks` instead of being
// the full 13-week constant. ALL_WEEKS is still exported elsewhere for the
// non-dashboard tables that show the entire quarter.
const ALL_WEEK_COLS: ColDef[] = ALL_WEEKS.map(w => ({ key: `w${w}`, label: `Week ${w}`, width: 64 }));
function weekCols(visibleWeeks: number[]): ColDef[] {
  return visibleWeeks.map(w => ({ key: `w${w}`, label: `Week ${w}`, width: 64 }));
}

// ── Status helpers ────────────────────────────────────────────────────────────

const DASH_STATUS_META: Record<string, { label: string; bg: string }> = Object.fromEntries(
  (Object.entries(STATUS_DOT) as [ItemStatus, string][]).map(([k, bg]) => [
    k,
    { label: getStatusLabel(k), bg },
  ]),
);

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch { return "—"; }
}

/**
 * Compact multi-select dropdown for the WWW status filter.
 *
 * Replaces the previous single-select `<select>`. Default selection (set by
 * the caller) is every status except "completed" — keeps the dashboard
 * focused on open work without making the user uncheck completed each time.
 *
 * Behavior:
 *   - Button label shows the count of selected statuses (or "All statuses"
 *     when every option is checked, "No statuses" when none are checked).
 *   - Click outside closes the popover (matches the file's existing
 *     mousedown-handler pattern for other dropdowns on this page).
 *   - Toggling a checkbox applies immediately — no separate Apply button.
 */
function StatusMultiSelect({
  selected,
  onChange,
  buttonClass,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  buttonClass: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function toggle(s: string) {
    onChange(selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]);
  }

  const label = selected.length === ITEM_STATUS_ORDER.length
    ? "All statuses"
    : selected.length === 0
      ? "No statuses"
      : `${selected.length} statuses`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${buttonClass} inline-flex items-center gap-1.5 cursor-pointer`}
      >
        {label}
        <svg
          className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute top-full right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px]"
        >
          {ITEM_STATUS_ORDER.map((s) => {
            const checked = selected.includes(s);
            return (
              <label
                key={s}
                role="option"
                aria-selected={checked}
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(s)}
                  className="rounded border-gray-300 text-accent-600 focus:ring-accent-400"
                />
                <span className="text-xs text-gray-700">{getStatusLabel(s)}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tooltips ──────────────────────────────────────────────────────────────────

function NoteTooltip({ text, children }: { text: string | null | undefined; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  if (!text) return <>{children}</>;

  function handleEnter() {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left });
    }
  }

  return (
    <div ref={ref} onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
      {children}
      {pos && createPortal(
        <div style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-64 bg-gray-900 text-white text-[11px] rounded-lg p-2.5 shadow-xl pointer-events-none">
          <div className="absolute bottom-full left-4 border-4 border-transparent border-b-gray-900" />
          <p className="font-medium text-gray-200 mb-1">Note</p>
          <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{text}</p>
        </div>,
        document.body
      )}
    </div>
  );
}

function WeekCellTooltip({ label, dateRange, content, children }: {
  label: string; dateRange: string; content: React.ReactNode; children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  function handleEnter() {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left + r.width / 2 });
    }
  }

  return (
    <div ref={ref} className="inline-flex justify-center w-full h-full"
      onMouseEnter={handleEnter} onMouseLeave={() => setPos(null)}>
      {children}
      {pos && createPortal(
        <div style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translateX(-50%)", zIndex: 9999 }}
          className="w-44 bg-gray-900 text-white text-[11px] rounded-lg p-2.5 shadow-xl pointer-events-none">
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-900" />
          <p className="font-semibold text-gray-200 mb-0.5">{label}</p>
          <p className="text-gray-400 text-[10px] mb-1.5">{dateRange}</p>
          {content}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Column types & helpers ────────────────────────────────────────────────────

interface ColDef { key: string; label: string; width: number; }

function colW(col: ColDef) { return { width: col.width, minWidth: col.width }; }
function weekNum(col: ColDef) { return parseInt(col.key.slice(1), 10); }

function getStickyStyle(colKey: string, frozenUpTo: string | null, cols: ColDef[], baseZ = 10): CSSProperties {
  if (!frozenUpTo) return {};
  const frozenIdx = cols.findIndex(c => c.key === frozenUpTo);
  const thisIdx = cols.findIndex(c => c.key === colKey);
  if (thisIdx === -1 || thisIdx > frozenIdx) return {};
  const left = cols.slice(0, thisIdx).reduce((s, c) => s + c.width, 0);
  return { position: "sticky", left, zIndex: baseZ };
}

function getFrozenBg(colKey: string, frozenUpTo: string | null, cols: ColDef[], rowBg: string): string {
  if (!frozenUpTo) return "";
  const frozenIdx = cols.findIndex(c => c.key === frozenUpTo);
  const thisIdx = cols.findIndex(c => c.key === colKey);
  return thisIdx !== -1 && thisIdx <= frozenIdx ? rowBg : "";
}

// ── Shared primitives ─────────────────────────────────────────────────────────

const TH_BASE = "group bg-gray-700 text-white text-[11px] font-semibold whitespace-nowrap border-r border-b border-gray-600 select-none";

function CalendarIcon() {
  return (
    <svg className="h-3 w-3 text-accent-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function DateCell({ iso }: { iso?: string | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <CalendarIcon />
      <span className="text-xs text-accent-600">{formatDate(iso)}</span>
    </div>
  );
}

function NoteCell({ text }: { text: string | null | undefined }) {
  return (
    <NoteTooltip text={text}>
      <span className="text-[11px] text-gray-500 line-clamp-2 cursor-default">
        {text ?? <span className="text-gray-300">No notes</span>}
      </span>
    </NoteTooltip>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="px-4 py-10 text-center text-sm text-gray-400">{label}</div>;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <svg className="h-5 w-5 animate-spin text-gray-300" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
}

function Section({ badge, count, right, children }: { badge: string; count?: number; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm" style={{ overflow: "clip" }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-xs font-bold text-white bg-gray-800 px-2.5 py-1 rounded-md">{badge}</span>
        {count !== undefined && count > 0 && (
          <span className="text-xs text-gray-400">{count} item{count !== 1 ? "s" : ""}</span>
        )}
        {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
      </div>
      {children}
    </div>
  );
}

/**
 * Collapsible container for the "KPI Overview" card grid on dashboard.
 * Starts collapsed; clicking the header toggles. The AvgKPICard summary
 * pill (avg % · on-track · at-risk · behind) lives inside the header to
 * the right of the card-count badge — visible even when collapsed.
 */
function KPIOverviewContainer({ count, loading, kpis, currentWeek, weekCount, children }: { count: number; loading: boolean; kpis: KPIRow[]; currentWeek: number | null; weekCount: number; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm" style={{ overflow: "clip" }}>
      {/* Whole header row toggles — click anywhere to expand/collapse.
          Uses role=button + keyboard handler so the entire area (including
          the AvgKPICard pill) is clickable without nesting <button>s. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((e) => !e)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors select-none cursor-pointer"
      >
        <svg
          className={`h-3.5 w-3.5 text-gray-400 flex-shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">KPI Overview</span>
        {!loading && count > 0 && (
          <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">
            {count} {count === 1 ? "card" : "cards"}
          </span>
        )}
        {/* AvgKPI summary pill — inert (div), clicks bubble up to toggle */}
        {!loading && kpis.length > 0 && <AvgKPICard kpis={kpis} currentWeek={currentWeek} weekCount={weekCount} />}
        <span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">
          {expanded ? "Click to collapse" : "Click to expand"}
        </span>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 10;

function Paginator({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
      <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          className="px-2 py-1 rounded border border-gray-200 hover:bg-white disabled:opacity-30 transition-colors">←</button>
        <span className="px-2 py-1 bg-gray-800 text-white rounded font-medium">{page}</span>
        <button onClick={() => onChange(page + 1)} disabled={page >= pages}
          className="px-2 py-1 rounded border border-gray-200 hover:bg-white disabled:opacity-30 transition-colors">→</button>
      </div>
    </div>
  );
}

function SectionTable({ children }: { children: React.ReactNode }) {
  return (
    <HorizontalScroller>
      <table className="border-separate border-spacing-0" style={{ minWidth: "max-content", tableLayout: "fixed" }}>
        {children}
      </table>
    </HorizontalScroller>
  );
}

// ── ColMenu ───────────────────────────────────────────────────────────────────

function ColMenu({ colKey, frozenUpTo, allColKeys, onFreeze }: {
  colKey: string;
  frozenUpTo: string | null;
  allColKeys: string[];
  onFreeze: (key: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const frozenIdx = frozenUpTo ? allColKeys.indexOf(frozenUpTo) : -1;
  const thisIdx = allColKeys.indexOf(colKey);
  const isFrozen = frozenIdx >= thisIdx && thisIdx !== -1 && frozenUpTo !== null;
  const isBoundary = frozenUpTo === colKey;

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div className="relative flex-shrink-0 inline-flex items-center gap-0.5" ref={ref}>
      {isBoundary && (
        <svg className="h-3 w-3 text-accent-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
        </svg>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="p-0.5 rounded hover:bg-white/20 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-[100] py-1 text-xs">
          <button
            onClick={() => { onFreeze(isFrozen ? null : colKey); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-gray-50 text-gray-700"
          >
            <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {isFrozen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 018 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />}
            </svg>
            {isFrozen ? "Unfreeze Column" : "Freeze Column"}
          </button>
        </div>
      )}
    </div>
  );
}

// Shared thead for sections that have static cols + week cols
function WeekTableHead({ staticCols, allCols, frozenUpTo, allColKeys, onFreeze, year, quarter, weekCols }: {
  staticCols: ColDef[];
  allCols: ColDef[];
  frozenUpTo: string | null;
  allColKeys: string[];
  onFreeze: (key: string | null) => void;
  year: number;
  quarter: string;
  weekCols: ColDef[];
}) {
  const weekLabels = useWeekLabels(year, quarter);
  return (
    <thead>
      <tr>
        {staticCols.map(col => (
          <th key={col.key} className={`sticky top-0 z-30 ${TH_BASE}`}
            style={{ ...getStickyStyle(col.key, frozenUpTo, allCols, 30), ...colW(col) }}>
            <div className="flex items-center gap-1 px-4 py-3">
              <span className="flex-1 truncate">{col.label}</span>
              <ColMenu colKey={col.key} frozenUpTo={frozenUpTo} allColKeys={allColKeys} onFreeze={onFreeze} />
            </div>
          </th>
        ))}
        {weekCols.map(col => (
          <th key={col.key} className={`sticky top-0 z-20 ${TH_BASE}`}
            style={{ ...getStickyStyle(col.key, frozenUpTo, allCols, 20), ...colW(col) }}>
            <div className="flex flex-col items-center px-1 py-1.5 gap-0.5">
              <span>{col.label}</span>
              <span className="text-[9px] font-normal opacity-60">{weekLabels[weekNum(col) - 1] ?? weekDateLabel(year, quarter, weekNum(col))}</span>
            </div>
          </th>
        ))}
      </tr>
    </thead>
  );
}

// ── KPI mini cards ────────────────────────────────────────────────────────────

function KPICard({ kpi, currentWeek, weekCount = 13, numberFormat = "standard" }: { kpi: KPIRow; currentWeek: number | null; weekCount?: number; numberFormat?: NumberFormat }) {
  // Same denominator for ratio AND percentage so the math agrees with what
  // the user reads. `getProgressBadgeColors` runs the canonical
  // `getColorByPercentage` internally and returns READABLE-on-white text
  // colors (text-blue-700 etc.) instead of the text-on-color text-white
  // tones — so the percentage label is visible on the white card.
  //
  // The card shows OVERALL quarterly progress: QTD Achieved / Quarterly Goal
  // (e.g. 33.2K / 150K = 22%) — the SAME basis as the Individual-KPI table's
  // Progress column and the Stats modal's "Overall Progress" headline. (It used
  // to divide by the to-date QTD goal — 33.2K / 125.2K = 27% — which made the
  // card disagree with the table and the Stats headline.) Standalone KPIs are
  // unchanged: resolveProgressOverall re-derives their per-week average against
  // the constant quarterly target, exactly as before.
  const { achieved, goal } = resolveProgressOverall(kpi, currentWeek, weekCount);
  const pct = goal > 0 ? (achieved / goal) * 100 : 0;
  const hasAnyWeeklyValue = (kpi.weeklyValues ?? []).some((wv) => wv.value != null);
  const badge = kpi.qtdAchieved != null
    ? getProgressBadgeColors(achieved, goal, hasAnyWeeklyValue, kpi.reverseColor ?? false)
    : { bar: "bg-gray-300", text: "text-gray-500", label: "—" };
  // Currency KPIs with a scale render their value in that unit (₹4 Cr / $9 M);
  // non-currency stays plain compact, toggle-driven. Display-only.
  const fmtKpiVal = (k: KPIRow, v: number | null | undefined) =>
    formatScaledKpiValue(v, {
      measurementUnit: k.measurementUnit,
      currency: k.currency,
      targetScale: k.targetScale,
      scaledDisplay: k.scaledDisplay,
      unit: k.unit,
      numberFormat,
    });
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <div className="group relative bg-white border border-gray-200 rounded-xl px-4 py-3 hover:shadow-sm transition-shadow">
      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
        <HistoryButton entityId={kpi.id} onClick={() => setHistoryOpen(true)} />
      </div>
      <p className="text-[11px] text-gray-500 font-medium truncate mb-1.5 pr-6" title={kpi.name}>{kpi.name}</p>
      <div
        className="flex items-baseline gap-1 mb-2"
        title="QTD Achieved / Quarterly Goal"
      >
        <span className="text-base font-bold text-gray-800">{fmtKpiVal(kpi, achieved)}</span>
        <span className="text-xs text-gray-400">/ {fmtKpiVal(kpi, goal)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold ${badge.text}`}>{pct.toFixed(0)}%</span>
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          {/* Bar width still clamps at 100% (container width). The color
              band already signals over-achievement; the text shows the
              true percentage. */}
          <div className={`h-1.5 rounded-full ${badge.bar}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>
      {historyOpen && <ChangeHistoryPanel kpi={kpi} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}

function AvgKPICard({ kpis, currentWeek, weekCount = 13 }: { kpis: KPIRow[]; currentWeek: number | null; weekCount?: number }) {
  // Average the SAME per-card percentage the KPICards below display
  // (resolveProgressQtd-based) so the pill agrees with the cards. Reading the
  // raw server-stamped `kpi.progressPercent` over-counted Standalone KPIs
  // (cumulative SUM ÷ goal) — see computeKpiOverviewStats /
  // docs/STANDALONE_QTD_ACHIEVED_FIX.md §4.
  const { avg, onTrack, atRisk, behind } = computeKpiOverviewStats(kpis, currentWeek, weekCount);

  const ringColor = avg >= 80 ? "#22c55e" : avg >= 50 ? "#f59e0b" : "#ef4444";
  const textColor = avg >= 80 ? "text-green-600" : avg >= 50 ? "text-amber-500" : "text-red-500";
  const border    = avg >= 80 ? "border-green-200 bg-green-50" : avg >= 50 ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50";

  const R = 10, CIRC = 2 * Math.PI * R;
  const dash = (Math.min(avg, 100) / 100) * CIRC;

  return (
    <div className={`flex items-center gap-3 px-4 py-1.5 rounded-full border ${border}`}>
      {/* Mini donut */}
      <svg width={28} height={28} viewBox="0 0 24 24" className="-rotate-90 flex-shrink-0">
        <circle cx={12} cy={12} r={R} fill="none" stroke="#e5e7eb" strokeWidth={3} />
        <circle cx={12} cy={12} r={R} fill="none" stroke={ringColor} strokeWidth={3}
          strokeDasharray={`${dash} ${CIRC}`} strokeLinecap="round" />
      </svg>
      {/* Avg % */}
      <span className={`text-sm font-bold ${textColor}`}>{avg}%</span>
      <span className="text-xs text-gray-400">avg KPI</span>
      {/* Divider */}
      <span className="hidden sm:inline-block w-px h-4 bg-gray-300" />
      {/* Breakdown */}
      <div className="hidden sm:flex items-center gap-3">
        <div className="flex flex-col items-center leading-tight">
          <span className="text-sm font-bold text-green-600">{onTrack}</span>
          <span className="text-[10px] text-green-500">on track</span>
        </div>
        <div className="flex flex-col items-center leading-tight">
          <span className="text-sm font-bold text-amber-500">{atRisk}</span>
          <span className="text-[10px] text-amber-400">at risk</span>
        </div>
        <div className="flex flex-col items-center leading-tight">
          <span className="text-sm font-bold text-red-500">{behind}</span>
          <span className="text-[10px] text-red-400">behind</span>
        </div>
      </div>
    </div>
  );
}

// ── KPI section ───────────────────────────────────────────────────────────────

const KPI_COLS: ColDef[] = [
  { key: "name",        label: "KPI Name",         width: 200 },
  { key: "unit",        label: "Measurement Unit", width: 130 },
  { key: "qtrGoal",     label: "Quarter Goal",     width: 110 },
  { key: "qtdGoal",     label: "QTD Goal",         width: 80  },
  { key: "qtdAchieved", label: "QTD Achieved",     width: 100 },
  { key: "weeklyGoal",  label: "Weekly Goal",      width: 90  },
  { key: "lastNotes",   label: "Last Notes",       width: 180 },
];

function KPISection({ kpis, year, quarter, visibleWeeks }: { kpis: KPIRow[]; year: number; quarter: string; visibleWeeks: number[] }) {
  const weekCount = useQuarterWeekCount(year, quarter);
  const [frozenUpTo, setFrozenUpTo] = useState<string | null>("name");
  const [page, setPage] = useState(1);
  // Derive per-render week columns + the combined column list. Memoized so
  // identity is stable while the visible window stays the same.
  const WEEK_COLS = useMemo(() => weekCols(visibleWeeks), [visibleWeeks]);
  const ALL_KPI_COLS = useMemo<ColDef[]>(() => [...KPI_COLS, ...WEEK_COLS], [WEEK_COLS]);
  const allColKeys = ALL_KPI_COLS.map(c => c.key);
  const paged = kpis.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const weekLabels = useWeekLabels(year, quarter);

  if (!kpis.length) return <EmptyState label="No KPI data found" />;

  return (
    <>
    <SectionTable>
      <WeekTableHead
        staticCols={KPI_COLS} allCols={ALL_KPI_COLS}
        frozenUpTo={frozenUpTo} allColKeys={allColKeys} onFreeze={setFrozenUpTo}
        year={year} quarter={quarter} weekCols={WEEK_COLS}
      />
      <tbody>
        {paged.map((kpi, ri) => {
          const rowBg = ri % 2 === 0 ? "bg-white" : "bg-gray-50";
          const weeklyGoal = (kpi.qtdGoal ?? kpi.target ?? 0) / weekCount;
          const weekMap: Record<number, number | null> = {};
          const weekNoteMap: Record<number, string | null> = {};
          (kpi.weeklyValues ?? []).forEach(wv => {
            weekMap[wv.weekNumber] = wv.value ?? null;
            weekNoteMap[wv.weekNumber] = wv.notes ?? null;
          });
          const weeklyTargets = kpi.weeklyTargets as Record<string, number> | null | undefined;

          return (
            <tr key={kpi.id} className={`${rowBg} hover:bg-accent-50 transition-colors`}>
              {KPI_COLS.map(col => {
                const sticky = getStickyStyle(col.key, frozenUpTo, ALL_KPI_COLS);
                const frozenBg = getFrozenBg(col.key, frozenUpTo, ALL_KPI_COLS, rowBg);
                const base = `border-r border-b border-gray-100 px-4 py-3 ${frozenBg}`;

                if (col.key === "lastNotes") {
                  // Mirror KPITable: pick the most recent weekly note, fall
                  // back to kpi.lastNotes. See `getLatestWeeklyNote`.
                  const latest = getLatestWeeklyNote(kpi);
                  const display = latest
                    ? (latest.weekNumber != null ? `W${latest.weekNumber}: ${latest.note}` : latest.note)
                    : null;
                  return (
                    <td key={col.key} className={base} style={{ ...sticky, ...colW(col) }}>
                      <NoteCell text={display} />
                    </td>
                  );
                }

                if (col.key === "qtdAchieved") {
                  const achieved = kpi.qtdAchieved ?? 0;
                  const goal = kpi.qtdGoal ?? kpi.target ?? 0;
                  const pct = goal > 0 ? (achieved / goal) * 100 : 0;
                  const colors = kpi.qtdAchieved != null ? progressColor(pct) : null;
                  return (
                    <td key={col.key}
                      className={`border-r border-b border-gray-100 px-4 py-3 text-center ${colors ? colors.bar : frozenBg}`}
                      style={{ ...sticky, ...colW(col) }}>
                      <span className={`text-xs font-semibold ${colors ? "text-white" : "text-gray-300"}`}>
                        {kpi.qtdAchieved != null ? fmtCompact(kpi.qtdAchieved) : "—"}
                      </span>
                    </td>
                  );
                }

                const content: Record<string, React.ReactNode> = {
                  name:       <span className="text-xs font-medium text-gray-800 line-clamp-2 block">{kpi.name}</span>,
                  unit:       <span className="text-xs text-gray-500">{kpi.measurementUnit}</span>,
                  qtrGoal:    <span className="text-xs text-gray-700">{fmtCompact(kpi.quarterlyGoal ?? kpi.target ?? null)}</span>,
                  qtdGoal:    <span className="text-xs text-gray-700">{fmtCompact(kpi.qtdGoal ?? null)}</span>,
                  weeklyGoal: <span className="text-xs text-gray-700">{weeklyGoal > 0 ? fmtCompact(weeklyGoal) : "—"}</span>,
                };

                return (
                  <td key={col.key} className={base} style={{ ...sticky, ...colW(col) }}>
                    {content[col.key]}
                  </td>
                );
              })}
              {WEEK_COLS.map((col: ColDef) => {
                const w = weekNum(col);
                const val = weekMap[w];
                const note = weekNoteMap[w];
                const wTarget = weeklyTargets ? (weeklyTargets[String(w)] ?? 0) : weeklyGoal;
                // weekCellColors divides by weekCount internally, so multiply back
                const { bg, text } = weekCellColors(val, wTarget * weekCount, null, false, weekCount);
                const frozenBg = getFrozenBg(col.key, frozenUpTo, ALL_KPI_COLS, rowBg);
                return (
                  <td key={col.key}
                    className={`border-r border-b border-gray-100 px-0 py-0 ${bg || frozenBg}`}
                    style={{ ...getStickyStyle(col.key, frozenUpTo, ALL_KPI_COLS), ...colW(col) }}>
                    <WeekCellTooltip
                      label={col.label} dateRange={weekLabels[w - 1] ?? weekDateLabel(year, quarter, w)}
                      content={
                        <div className="space-y-1">
                          <div className="flex justify-between gap-3">
                            <span className="text-gray-400">Value</span>
                            <span className="text-white font-medium">{val != null ? fmt(val) : "—"}</span>
                          </div>
                          <div className="flex justify-between gap-3">
                            <span className="text-gray-400">Target</span>
                            <span className="text-white font-medium">{wTarget > 0 ? fmt(wTarget) : "—"}</span>
                          </div>
                          {note && (
                            <p className="text-gray-300 text-[10px] mt-1.5 pt-1.5 border-t border-gray-700 leading-relaxed whitespace-pre-wrap">{note}</p>
                          )}
                        </div>
                      }
                    >
                      <div className="flex items-center justify-center w-full h-full min-h-[36px]">
                        <span className={`text-xs font-semibold ${text}`}>{val != null ? fmtCompact(val) : "–"}</span>
                      </div>
                    </WeekCellTooltip>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </SectionTable>
    <Paginator page={page} total={kpis.length} onChange={setPage} />
    </>
  );
}

// ── Priority section ──────────────────────────────────────────────────────────

const PRI_COLS: ColDef[] = [
  { key: "name",      label: "Priority Name", width: 200 },
  { key: "startWeek", label: "Start Week",    width: 160 },
  { key: "endWeek",   label: "End Week",      width: 160 },
  { key: "lastNotes", label: "Last Notes",    width: 180 },
];

function PrioritySection({ priorities, year, quarter, visibleWeeks }: { priorities: PriorityRow[]; year: number; quarter: string; visibleWeeks: number[] }) {
  const weekCount = useQuarterWeekCount(year, quarter);
  const [frozenUpTo, setFrozenUpTo] = useState<string | null>("name");
  const [page, setPage] = useState(1);
  const weekLabels = useWeekLabels(year, quarter);
  const WEEK_COLS = useMemo(() => weekCols(visibleWeeks), [visibleWeeks]);
  const ALL_PRI_COLS = useMemo<ColDef[]>(() => [...PRI_COLS, ...WEEK_COLS], [WEEK_COLS]);
  const allColKeys = ALL_PRI_COLS.map(c => c.key);
  const paged = priorities.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!priorities.length) return <EmptyState label="No Priority data found" />;

  return (
    <>
    <SectionTable>
      <WeekTableHead
        staticCols={PRI_COLS} allCols={ALL_PRI_COLS}
        frozenUpTo={frozenUpTo} allColKeys={allColKeys} onFreeze={setFrozenUpTo}
        year={year} quarter={quarter} weekCols={WEEK_COLS}
      />
      <tbody>
        {paged.map((p, ri) => {
          const rowBg = ri % 2 === 0 ? "bg-white" : "bg-gray-50";
          const start = p.startWeek ?? 1;
          const end = p.endWeek ?? weekCount;
          const statusMap: Record<number, string> = {};
          const weekNoteMap: Record<number, string | null> = {};
          p.weeklyStatuses.forEach(ws => {
            statusMap[ws.weekNumber] = ws.status;
            weekNoteMap[ws.weekNumber] = ws.notes ?? null;
          });
          // Most recently EDITED note (max updatedAt), with priority-level
          // fallback. Matches PriorityTable behavior. Dashboard has no
          // optimistic state — read-only preview.
          const latestNote = getLatestPriorityNote(p.weeklyStatuses, undefined, p.notes);
          const lastNote = latestNote
            ? (latestNote.weekNumber != null ? `W${latestNote.weekNumber}: ${latestNote.note}` : latestNote.note)
            : null;

          return (
            <tr key={p.id} className={`${rowBg} hover:bg-accent-50 transition-colors`}>
              {PRI_COLS.map(col => {
                const sticky = getStickyStyle(col.key, frozenUpTo, ALL_PRI_COLS);
                const frozenBg = getFrozenBg(col.key, frozenUpTo, ALL_PRI_COLS, rowBg);
                const base = `border-r border-b border-gray-100 px-4 py-3 ${frozenBg}`;

                if (col.key === "lastNotes") return (
                  <td key={col.key} className={base} style={{ ...sticky, ...colW(col) }}>
                    <NoteCell text={lastNote} />
                  </td>
                );

                const content: Record<string, React.ReactNode> = {
                  name:      <span className="text-xs font-medium text-gray-800 line-clamp-2 block">{p.name}</span>,
                  startWeek: <span className="text-xs text-gray-500 whitespace-nowrap">Week {start} · {weekLabels[start - 1] ?? weekDateLabel(year, quarter, start)}</span>,
                  endWeek:   <span className="text-xs text-gray-500 whitespace-nowrap">Week {end} · {weekLabels[end - 1] ?? weekDateLabel(year, quarter, end)}</span>,
                };

                return (
                  <td key={col.key} className={base} style={{ ...sticky, ...colW(col) }}>
                    {content[col.key]}
                  </td>
                );
              })}
              {WEEK_COLS.map((col: ColDef) => {
                const w = weekNum(col);
                const inRange = w >= start && w <= end;
                const status = statusMap[w] ?? "";
                const meta = DASH_STATUS_META[status];
                const bg = inRange ? (meta?.bg ?? "") : "";
                const frozenBg = getFrozenBg(col.key, frozenUpTo, ALL_PRI_COLS, rowBg);
                const sticky = getStickyStyle(col.key, frozenUpTo, ALL_PRI_COLS);

                if (!inRange) {
                  return (
                    <td key={col.key}
                      className={`border-r border-b border-gray-100 px-0 py-0 bg-gray-50 ${frozenBg}`}
                      style={{ ...sticky, ...colW(col) }}>
                      <div className="flex items-center justify-center w-full min-h-[36px]">
                        <svg className="h-3 w-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                    </td>
                  );
                }

                return (
                  <td key={col.key}
                    className={`border-r border-b border-gray-100 px-0 py-0 ${bg || frozenBg}`}
                    style={{ ...sticky, ...colW(col) }}>
                    <WeekCellTooltip
                      label={col.label} dateRange={weekLabels[w - 1] ?? weekDateLabel(year, quarter, w)}
                      content={
                        <div className="space-y-1">
                          <p className="text-white font-medium">{meta?.label ?? "No status"}</p>
                          {weekNoteMap[w] && (
                            <p className="text-gray-300 text-[10px] pt-1.5 border-t border-gray-700 leading-relaxed whitespace-pre-wrap">{weekNoteMap[w]}</p>
                          )}
                        </div>
                      }
                    >
                      <div className="flex items-center justify-center w-full min-h-[36px]" />
                    </WeekCellTooltip>
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </SectionTable>
    <Paginator page={page} total={priorities.length} onChange={setPage} />
    </>
  );
}

// ── WWW section ───────────────────────────────────────────────────────────────

const WWW_COLS: ColDef[] = [
  { key: "who",         label: "Who?",         width: 160 },
  { key: "when",        label: "When?",        width: 110 },
  { key: "what",        label: "What?",        width: 280 },
  { key: "revisedDate", label: "Revised Date", width: 130 },
  { key: "status",      label: "Status",       width: 140 },
  { key: "notes",       label: "Notes",        width: 300 },
];

function WWWSection({ items }: { items: WWWItem[] }) {
  const [frozenUpTo, setFrozenUpTo] = useState<string | null>("who");
  const [page, setPage] = useState(1);
  const allColKeys = WWW_COLS.map(c => c.key);
  const paged = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!items.length) return <EmptyState label="No WWW data found" />;

  return (
    <>
    <HorizontalScroller>
      <table className="border-separate border-spacing-0" style={{ tableLayout: "fixed", minWidth: "max-content", width: "100%" }}>
        <thead>
          <tr>
            {WWW_COLS.map(col => (
              <th key={col.key} className={`sticky top-0 z-20 ${TH_BASE}`}
                style={{ ...getStickyStyle(col.key, frozenUpTo, WWW_COLS, 20), ...colW(col) }}>
                <div className="flex items-center gap-1 px-4 py-3">
                  <span className="flex-1 truncate">{col.label}</span>
                  <ColMenu colKey={col.key} frozenUpTo={frozenUpTo} allColKeys={allColKeys} onFreeze={setFrozenUpTo} />
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paged.map((item, ri) => {
            const rowBg = ri % 2 === 0 ? "bg-white" : "bg-gray-50";
            const whoName = item.who_user ? `${item.who_user.firstName} ${item.who_user.lastName}` : "—";
            const lastRevised = item.revisedDates?.length ? item.revisedDates[item.revisedDates.length - 1] : null;
            const statusMeta = DASH_STATUS_META[item.status];

            return (
              <tr key={item.id} className={`${rowBg} hover:bg-accent-50 transition-colors`}>
                {WWW_COLS.map(col => {
                  const sticky = getStickyStyle(col.key, frozenUpTo, WWW_COLS);
                  const frozenBg = getFrozenBg(col.key, frozenUpTo, WWW_COLS, rowBg);

                  if (col.key === "status") {
                    const bg = statusMeta?.bg ?? "";
                    return (
                      <td key={col.key}
                        className={`border-r border-b border-gray-100 px-4 py-3 text-center ${bg || frozenBg}`}
                        style={{ ...sticky, ...colW(col) }}>
                        <span className={`text-xs font-semibold ${bg ? "text-white" : "text-gray-400"}`}>
                          {statusMeta?.label ?? "—"}
                        </span>
                      </td>
                    );
                  }

                  const content: Record<string, React.ReactNode> = {
                    who:         <span className="text-xs font-medium text-gray-800 truncate block">{whoName}</span>,
                    when:        <DateCell iso={item.when} />,
                    what:        <span className="text-xs text-gray-800 line-clamp-2 block">{item.what}</span>,
                    revisedDate: lastRevised ? <DateCell iso={lastRevised} /> : <span className="text-xs text-gray-300">—</span>,
                    notes:       <NoteTooltip text={item.notes}><span className="text-xs text-gray-600 line-clamp-2 cursor-default">{item.notes || <span className="text-gray-300">—</span>}</span></NoteTooltip>,
                  };

                  return (
                    <td key={col.key}
                      className={`border-r border-b border-gray-100 px-4 py-3 ${frozenBg}`}
                      style={{ ...sticky, ...colW(col) }}>
                      {content[col.key]}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </HorizontalScroller>
    <Paginator page={page} total={items.length} onChange={setPage} />
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  // Year + quarter live in FilterContext (persisted across navigation + refresh).
  // The shared OWNER filter also lives there: the Team tab both reads it (so it
  // reflects an owner picked on KPI / Priority / WWW) and writes it (so those
  // pages pick up the Team tab's choice). The My Dashboard tab is a personal,
  // self-only view and deliberately leaves the shared owner untouched.
  const { filterOwner, year, setYear, quarter, setQuarter, setFilterTeam, setFilterOwner } = useFilterContext();
  const [activeTab, setActiveTab] = useState<"individual" | "team">("individual");

  // Dashboard-level trash toggle — per-section. When a section is in this Set,
  // the corresponding cards/rows filter to `deletedAt != null`. Honest caveat:
  // dashboard summary API currently excludes soft-deleted rows server-side, so
  // sections in trash mode will render empty until the API adds includeDeleted.
  const [dashTrashSections, setDashTrashSections] = useState<Set<DashboardSectionKey>>(new Set());

  // My Dashboard is always scoped to the current user; the Team tab carries
  // its own 3-stage filter (team / KPI type / owner) — no role-based gating
  // is applied at this level any more.
  const { data: session, status: sessionStatus } = useSession();
  const userId = session?.user?.id ?? "";
  // Dashboard number-format preference (Indian lakh/crore vs standard K/M),
  // org-level via the `use_indian_numbering` config flag. View-only.
  const numberFormat = useNumberFormat();

  /* ── Consolidated dashboard data — one API call instead of six ─────── */
  // `refetchSummary` re-runs the consolidated query (KPI overview cards + grid +
  // export + filter dropdowns); `summaryFetching` is true during any in-flight
  // fetch. Both feed the manual Reload button below.
  const { data: summary, isLoading, refetch: refetchSummary, isFetching: summaryFetching } = useDashboardSummary({ year, quarter });
  const summaryData = summary?.data;
  // Each of these uses `?? []` which would create a fresh array on every
  // render when the source is undefined — that breaks downstream useMemo
  // deps. Memoize each so consumers can include them in deps cleanly.
  const allIndKpis = useMemo<KPIRow[]>(
    () => (summaryData?.individualKPIs ?? []) as KPIRow[],
    [summaryData],
  );
  const allTeamKpis = useMemo<KPIRow[]>(
    () => (summaryData?.teamKPIs ?? []) as KPIRow[],
    [summaryData],
  );
  const allPriorities = useMemo<PriorityRow[]>(
    () => (summaryData?.priorities ?? []) as PriorityRow[],
    [summaryData],
  );
  const allWWW = useMemo<WWWItem[]>(
    () => (summaryData?.wwwItems ?? []) as WWWItem[],
    [summaryData],
  );
  // Teams come from the dedicated `useTeams()` query so the team-create
  // mutation in Org Setup (which invalidates `["teams"]`) is reflected here
  // without a hard refresh. Previously this was derived from the dashboard
  // summary payload, whose own cache key isn't busted on team create.
  const { data: teamsData = [] } = useTeams();
  const teams = useMemo(
    () => teamsData.map((t) => ({ id: t.id, name: t.name })),
    [teamsData],
  );

  // ── Team tab filters (3-stage) ──
  // A: Team scope — "" = All Users (no team filter); else specific team id.
  // B: KPI type   — "individual" | "team" — only swaps the KPI section level.
  // C: Owner       — "" = All Users; else a specific user id.
  // A and C apply to ALL sections (KPI / Priority / WWW).
  // B applies only to the KPI section.
  const [teamTabTeamId, setTeamTabTeamId] = useState<string>("");
  const [teamTabKpiType, setTeamTabKpiType] = useState<"individual" | "team">("individual");
  // Seed from the shared filter so revisiting the Team tab reflects an owner
  // picked elsewhere (KPI / Priority / WWW). The dashboard remounts on each
  // navigation, so this re-reads the current shared owner every visit.
  const [teamTabOwnerId, setTeamTabOwnerId] = useState<string>(filterOwner);
  // Note: clearing the owner when the team changes is done in the Team picker's
  // onChange (below), NOT in an effect — an effect keyed on teamTabTeamId would
  // also fire on mount and wipe the owner we just seeded from the shared filter.

  // ── KPI Type toggle gating ──
  // The "Individual KPI / Team KPI" tab buttons only make sense when the
  // user can actually see BOTH lists. If they're missing one permission,
  // surfacing a toggle that snaps them to an empty page is just confusing.
  // Resource names mirror the permissions registry: "KPI" = Individual KPI,
  // "TeamKPI" = Team KPI. Pattern matches the sidebar's existing nav-gate
  // (components/dashboard/sidebar.tsx).
  const perms = useMyPermissions();
  // Also gate on the org-level feature flags so super-admin disabling
  // `kpi.individual` or `kpi.teams` for this tenant hides the matching side
  // of the KPI Type toggle (mirrors how the sidebar gates the nav links —
  // see components/dashboard/sidebar.tsx). Without this, the toggle still
  // appeared in the Team-tab filter even when the matching module link was
  // hidden from the sidebar, snapping users to an empty data view.
  const disabled = useDisabledModules();
  const canViewIndividualKPI = perms.has("KPI", "view") && !disabled.has("kpi.individual");
  const canViewTeamKPI = perms.has("TeamKPI", "view") && !disabled.has("kpi.teams");
  const showKpiTypeToggle = canViewIndividualKPI && canViewTeamKPI;

  // If the user's current selection points at a permission they don't have
  // (e.g. they had Team selected, then their role got narrowed), snap to
  // whichever side they CAN view. Guarded on `!perms.loading` so we don't
  // flip during the initial permission fetch.
  useEffect(() => {
    if (perms.loading) return;
    if (teamTabKpiType === "team" && !canViewTeamKPI) {
      setTeamTabKpiType("individual");
    } else if (teamTabKpiType === "individual" && !canViewIndividualKPI && canViewTeamKPI) {
      setTeamTabKpiType("team");
    }
  }, [perms.loading, canViewIndividualKPI, canViewTeamKPI, teamTabKpiType]);

  // ── Sync Dashboard scope → FilterContext ──
  // Hand the active tab's scope to the shared filter so KPI / Team KPI /
  // Priority / WWW reflect it on navigation:
  //   • My Dashboard → SELF (owner = current user, no team). Year + quarter ride
  //     along via FilterContext, so the modules show your own data for the
  //     current period.
  //   • Team tab → the picked owner / team.
  // The Team tab still shows a persisted owner because `teamTabOwnerId` is seeded
  // from `ctx.filterOwner` at mount (before this effect's self-write), and the
  // owner-reset-on-team-change lives in the Team picker's onChange (not a mount
  // effect). WWW ignores `filterTeam` by product rule, so team never bleeds in.
  useEffect(() => {
    if (activeTab === "individual") {
      setFilterTeam("");
      setFilterOwner(userId || "");
    } else {
      setFilterTeam(teamTabTeamId || "");
      setFilterOwner(teamTabOwnerId || "");
    }
  }, [activeTab, teamTabTeamId, teamTabOwnerId, userId, setFilterTeam, setFilterOwner]);

  // Team-scope member set — ONLY the selected team's members (a bounded list),
  // used to filter individual KPIs/Priorities/WWW by `owner ∈ team`. Gated so
  // we never bulk-load the whole org just to build a Set that's unused unless a
  // team is actually selected (teamScopeUserIds is null without one).
  const { data: teamMembersForScope = [] } = useUsers(teamTabTeamId || undefined, { enabled: !!teamTabTeamId });
  const teamUserIds = useMemo(() => new Set(teamMembersForScope.map(u => u.id)), [teamMembersForScope]);

  // Owner picker — DB-level infinite (25/page) + server search, scoped to the
  // selected team when one is picked. No full org load.
  const [ownerSearch, setOwnerSearch] = useState("");
  const {
    users: ownerOptions,
    isLoading: ownersLoading,
    hasNextPage: ownersHasMore,
    isFetchingNextPage: ownersLoadingMore,
    fetchNextPage: fetchMoreOwners,
  } = useInfiniteUsers(teamTabTeamId || undefined, ownerSearch);

  // Multi-select WWW status filter. Defaults to every status EXCEPT
  // "completed" — keeps the dashboard focused on actionable work; users can
  // re-include completed items via the dropdown. Persisted (browser-tab session)
  // under its own key so the selection survives navigation + refresh; this is
  // the Dashboard WWW section's own filter, independent of the WWW page's.
  const [wwwStatusFilter, setWwwStatusFilter] = useSessionState<string[]>(
    "qs:dash:www:status",
    ITEM_STATUS_ORDER.filter(s => s !== "completed"),
  );

  /* ── My Dashboard tab — always scoped to the current user ───────────── */
  // KPI section: Individual KPIs owned by the user + Team KPIs they co-own.
  // Priorities + WWW: rows owned by the user.
  const myIndKpis: KPIRow[] = useMemo(
    () => allIndKpis.filter((k) => k.owner === userId),
    [allIndKpis, userId],
  );
  const myTeamKpis: KPIRow[] = useMemo(
    () => allTeamKpis.filter((k) => ((k.ownerIds ?? []) as string[]).includes(userId)),
    [allTeamKpis, userId],
  );
  const myKpis: KPIRow[] = useMemo(
    () => [...myIndKpis, ...myTeamKpis],
    [myIndKpis, myTeamKpis],
  );
  const myPriorities = useMemo(
    () => allPriorities.filter((p) => p.owner === userId),
    [allPriorities, userId],
  );
  const myWwwByOwner = useMemo(
    () => allWWW.filter((w) => w.who === userId),
    [allWWW, userId],
  );

  /* ── Team tab — 3-stage filter (team scope, KPI type, owner) ────────── */
  // Filter A (teamTabTeamId) + Filter C (teamTabOwnerId) apply to all sections.
  // Filter B (teamTabKpiType) only swaps the KPI section level.
  const teamScopeUserIds = teamTabTeamId ? teamUserIds : null;
  const ownerFilter = teamTabOwnerId || null;

  const teamKpis: KPIRow[] = useMemo(() => {
    if (teamTabKpiType === "individual") {
      let rows = allIndKpis;
      if (teamScopeUserIds) rows = rows.filter((k) => !!k.owner && teamScopeUserIds.has(k.owner));
      if (ownerFilter) rows = rows.filter((k) => k.owner === ownerFilter);
      return rows;
    }
    // Team-level KPIs: scope by teamId, then by ownerIds when an owner is picked.
    let rows = allTeamKpis;
    if (teamTabTeamId) rows = rows.filter((k) => k.teamId === teamTabTeamId);
    if (ownerFilter) {
      rows = rows.filter((k) => ((k.ownerIds ?? []) as string[]).includes(ownerFilter));
    }
    return rows;
  }, [teamTabKpiType, allIndKpis, allTeamKpis, teamScopeUserIds, ownerFilter, teamTabTeamId]);

  const teamPriorities = useMemo(() => {
    if (ownerFilter) return allPriorities.filter((p) => p.owner === ownerFilter);
    if (teamScopeUserIds) return allPriorities.filter((p) => teamScopeUserIds.has(p.owner));
    return allPriorities;
  }, [allPriorities, teamScopeUserIds, ownerFilter]);

  const teamWwwByOwner = useMemo(() => {
    if (ownerFilter) return allWWW.filter((w) => w.who === ownerFilter);
    if (teamScopeUserIds) return allWWW.filter((w) => teamScopeUserIds.has(w.who));
    return allWWW;
  }, [allWWW, teamScopeUserIds, ownerFilter]);

  /* ── Active tab data selection ───────────────────────────────────────── */
  const kpis = activeTab === "individual" ? myKpis : teamKpis;
  // Summary-blob loading drives the KPI overview cards/grid (which use the full
  // filtered set). The three TABLES have their own loading flags derived from
  // their DB-level queries — see kpiTableLoading / priTableLoading below.
  //
  // Also treat the page as loading while the NextAuth session is still
  // resolving: `myKpis` filters by `k.owner === userId`, and `userId` is "" until
  // the session lands. Without this, when the summary query resolves BEFORE the
  // session, the gate `(kpisLoading || kpis.length > 0)` briefly sees an empty
  // filtered list and unmounts the whole KPI Overview card — then remounts once
  // the session arrives. Folding the session-loading state in keeps the section
  // mounted (showing its skeleton) across that race instead of flickering.
  const kpisLoading = isLoading || sessionStatus === "loading";
  const priorities = activeTab === "individual" ? myPriorities : teamPriorities;
  const wwwSource = activeTab === "individual" ? myWwwByOwner : teamWwwByOwner;
  // Multi-select filter — keep rows whose status is in the selected set.
  // Empty selection → empty list (user has explicitly unchecked every
  // status; they can re-check from the dropdown).
  const wwwItems = wwwSource.filter((w) => wwwStatusFilter.includes(w.status));

  // Independent DB-level sort + search state for the three Dashboard tables.
  // Kept LOCAL (not the Redux tables slice the module pages use) so sorting or
  // searching the dashboard preview never changes the /kpi /priority /www
  // pages. Sort values are the BACKEND sort keys (e.g. "qtdAchieved", "who").
  const [kpiSortBy, setKpiSortBy] = useState("");
  const [kpiSortOrder, setKpiSortOrder] = useState<"asc" | "desc">("asc");
  const [priSortBy, setPriSortBy] = useState("");
  const [priSortOrder, setPriSortOrder] = useState<"asc" | "desc">("asc");
  const [wwwSortBy, setWwwSortBy] = useState("");
  const [wwwSortOrder, setWwwSortOrder] = useState<"asc" | "desc">("asc");

  const [kpiSearchInput, setKpiSearchInput] = useState("");
  const [priSearchInput, setPriSearchInput] = useState("");
  const [wwwSearchInput, setWwwSearchInput] = useState("");
  // 500ms debounce per the dashboard spec — a longer pause before each server
  // search fires (and, via the query key, resets the section to page 1).
  const kpiSearch = useDebouncedValue(kpiSearchInput, 500);
  const priSearch = useDebouncedValue(priSearchInput, 500);
  const wwwSearch = useDebouncedValue(wwwSearchInput, 500);

  // Hidden-column pills — read straight from useTablePrefs so the dashboard
  // mirrors the main pages. Showing a column from the pill persists via the
  // same store used by the KPI/Priority/WWW pages.
  const kpiPrefs = useTablePrefs("kpi");
  const priorityPrefs = useTablePrefs("priority");
  const wwwPrefs = useTablePrefs("www");
  const kpiAllCols = useMemo(
    () => [...ALL_STATIC_COLS, ...FISCAL_ALL_WEEKS.map((w) => `week${w}`)],
    [],
  );
  const kpiHiddenSet = useMemo(() => new Set(kpiPrefs.hiddenCols), [kpiPrefs.hiddenCols]);
  const PRIORITY_DASH_COL_LABELS: Record<string, string> = {
    team: "Team", priorityName: "Priority Name", owner: "Owner",
    startWeek: "Start Week", endWeek: "End Week", lastNote: "Last Note",
  };
  const WWW_DASH_COL_LABELS: Record<string, string> = {
    who: "Who", when: "When", what: "What", revisedDate: "Revised Date",
    status: "Status", notes: "Notes",
  };

  // ── DB-level infinite-scroll table data ──────────────────────────────────
  // Each section streams 25 rows/page and accumulates pages as the user scrolls
  // (see InfiniteTableShell + useInfinite* hooks). The `filters` object is part
  // of each query key, so changing search / tab / filter / sort automatically
  // resets to page 1 and clears the accumulated rows — no manual page state.
  // State is fully independent per section: scrolling one never refetches
  // another. The consolidated `useDashboardSummary` blob above still powers the
  // KPI overview cards, the card grid, export, and the filter dropdowns.

  // KPI: "My Dashboard" uses scope=mine (individual-owned ∪ team-co-owned).
  // Team tab maps the 3-stage filter to kpiLevel + owner / teamId (owner takes
  // precedence over team, mirroring the old client logic).
  const kpiFilters = useMemo<ListFilters>(() => {
    const f: ListFilters = {
      year,
      quarter,
      search: kpiSearch.trim() || undefined,
      sortBy: kpiSortBy || undefined,
      sortOrder: kpiSortBy ? kpiSortOrder : undefined,
    };
    if (activeTab === "individual") {
      f.scope = "mine";
    } else {
      f.kpiLevel = teamTabKpiType;
      if (teamTabOwnerId) f.owner = teamTabOwnerId;
      else if (teamTabTeamId) f.teamId = teamTabTeamId;
    }
    return f;
  }, [year, quarter, kpiSearch, kpiSortBy, kpiSortOrder, activeTab, teamTabKpiType, teamTabOwnerId, teamTabTeamId]);

  const priFilters = useMemo<ListFilters>(() => ({
    year,
    quarter,
    search: priSearch.trim() || undefined,
    sortBy: priSortBy || undefined,
    sortOrder: priSortBy ? priSortOrder : undefined,
    ...(activeTab === "individual"
      ? { owner: userId }
      : teamTabOwnerId
        ? { owner: teamTabOwnerId }
        : teamTabTeamId
          ? { teamId: teamTabTeamId }
          : {}),
  }), [year, quarter, priSearch, priSortBy, priSortOrder, activeTab, userId, teamTabOwnerId, teamTabTeamId]);

  const wwwFilters = useMemo<ListFilters>(() => ({
    search: wwwSearch.trim() || undefined,
    sortBy: wwwSortBy || undefined,
    sortOrder: wwwSortBy ? wwwSortOrder : undefined,
    // Multi-select status → comma-joined `status IN (...)`. Empty selection
    // forces an empty result (sentinel) rather than "all", matching the old
    // client behaviour where unchecking every status cleared the list.
    status: wwwStatusFilter.length ? wwwStatusFilter.join(",") : "__none__",
    ...(activeTab === "individual"
      ? { who: userId }
      : teamTabOwnerId
        ? { who: teamTabOwnerId }
        : teamTabTeamId
          ? { teamId: teamTabTeamId }
          : {}),
  }), [wwwSearch, wwwSortBy, wwwSortOrder, wwwStatusFilter, activeTab, userId, teamTabOwnerId, teamTabTeamId]);

  const kpiTableQuery = useInfiniteKPIs(kpiFilters);
  const priTableQuery = useInfinitePriorities(priFilters);
  const wwwTableQuery = useInfiniteWWW(wwwFilters);

  const kpiRows = kpiTableQuery.rows;
  const kpiTotal = kpiTableQuery.total;
  const priRows = priTableQuery.rows;
  const priTotal = priTableQuery.total;
  const wwwRows = wwwTableQuery.rows;
  const wwwTotal = wwwTableQuery.total;

  // Owner-picker label fallback. `teamTabOwnerId` is seeded from the persisted
  // shared filter at mount (and the owner list is a server-paginated 25/page
  // slice), so the applied owner often isn't in `ownerOptions`. Without a
  // fallback the FilterPicker trigger shows "All Users" even though the filter
  // IS applied (the "N filters" badge proves it). Resolve the owner's name from
  // any loaded source — the selected team's members, or the owner-scoped KPI /
  // Priority / WWW rows — and feed it as the picker's `selectedOption`. Mirrors
  // the KPI page's `selectedOwnerOption` pattern.
  const selectedOwnerOption = useMemo(() => {
    if (!teamTabOwnerId) return undefined;
    if (ownerOptions.some((u) => u.id === teamTabOwnerId)) return undefined;
    const fromTeam = teamMembersForScope.find((u) => u.id === teamTabOwnerId);
    if (fromTeam) {
      return userToFilterOption({
        id: teamTabOwnerId,
        firstName: fromTeam.firstName,
        lastName: fromTeam.lastName,
        email: fromTeam.email ?? "",
      });
    }
    const found =
      kpiRows.find((k) => k.owner === teamTabOwnerId)?.owner_user ??
      kpiRows.flatMap((k) => k.owners ?? []).find((o) => o.id === teamTabOwnerId) ??
      priRows.find((p) => p.owner === teamTabOwnerId)?.owner_user ??
      wwwRows.find((w) => w.who === teamTabOwnerId)?.who_user;
    return found
      ? userToFilterOption({ id: teamTabOwnerId, firstName: found.firstName, lastName: found.lastName, email: "" })
      : undefined;
  }, [teamTabOwnerId, ownerOptions, teamMembersForScope, kpiRows, priRows, wwwRows]);

  // Sort handlers — the tables call these with the backend sort key + dir.
  // Toggling the same column to the same direction again is a no-op for the
  // user; clearing (col "") resets to the endpoint's default order.
  const handleKpiSort = (col: string, dir: "asc" | "desc") => { setKpiSortBy(col); setKpiSortOrder(dir); };
  const handlePriSort = (col: string, dir: "asc" | "desc") => { setPriSortBy(col); setPriSortOrder(dir); };
  const handleWwwSort = (col: string, dir: "asc" | "desc") => { setWwwSortBy(col); setWwwSortOrder(dir); };

  // ── Manual "Reload" — revalidate all dashboard data in place ──────────────
  // Re-runs react-query's existing queries (the SWR `mutate()`/`revalidate()`
  // equivalent): the consolidated summary blob (KPI overview cards/grid) plus
  // the three infinite-scroll tables (KPI / Priority / WWW). It does NOT touch
  // any business logic, filters, sort, or pagination — it only refetches the
  // current query keys, so every widget repaints with fresh server data and the
  // active filter/sort/scroll state is preserved. No full page reload occurs.
  //
  // On failure react-query keeps the last successful data in cache (the queries
  // are not reset), so a failed refresh leaves the dashboard showing the prior
  // good data rather than blanking out. `isReloading` drives the button spinner;
  // re-entrancy is guarded so rapid clicks don't stack duplicate requests.
  const [isReloading, setIsReloading] = useState(false);
  const handleReload = async () => {
    if (isReloading) return;
    setIsReloading(true);
    try {
      await Promise.all([
        refetchSummary(),
        kpiTableQuery.refetch(),
        priTableQuery.refetch(),
        wwwTableQuery.refetch(),
      ]);
    } catch {
      // Errors are already surfaced per-query (isError/error on each hook) and
      // the last successful data is preserved — swallow here so the button
      // simply returns to its idle state.
    } finally {
      setIsReloading(false);
    }
  };
  // Reflect any in-flight fetch (manual reload OR an automatic refetch) so the
  // button can't be triggered while data is already streaming in.
  const reloadBusy = isReloading || summaryFetching || kpiTableQuery.isFetching || priTableQuery.isFetching || wwwTableQuery.isFetching;

  // Table spinners show only on the FIRST load of each query. `keepPreviousData`
  // (set in the hooks) holds the prior page visible during sort/page/search
  // refetches, so `isLoading` is false after the initial fetch — no flicker.
  const kpiTableLoading = kpiTableQuery.isLoading;
  const priTableLoading = priTableQuery.isLoading;
  const wwwTableLoading = wwwTableQuery.isLoading;

  // DB-driven current week + date range + per-week compact labels.
  const currentWeek = useCurrentWeek(year, quarter);
  const currentWeekRange = useWeekDateRange(year, quarter, currentWeek);
  const weekLabels = useWeekLabels(year, quarter);
  // Weeks in the active quarter (Custom Quarter Settings). Defaults to 13.
  const weekCount = useQuarterWeekCount(year, quarter);

  // Rolling 5-week window. The dashboard always limits the week-grid to 5
  // weeks ending at the current week. For past quarters useCurrentWeek
  // clamps to 13 (so we get weeks 9-13), for future quarters it returns 1
  // (so we get weeks 1-5). Until currentWeek is loaded we fall back to the
  // first 5 weeks so the table renders something instead of being empty.
  const visibleWeeks = useMemo(
    () => rollingVisibleWeeks(currentWeek ?? 5, 5, weekCount),
    [currentWeek, weekCount],
  );
  const hiddenWeekCols = useMemo(() => {
    const visible = new Set(visibleWeeks);
    return weeksArray(weekCount).filter(w => !visible.has(w)).map(w => `week${w}`);
  }, [visibleWeeks, weekCount]);

  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  // Active filter badge count for the Team tab — "Individual" default for B
  // is not counted; only A (team) and C (owner) contribute.
  const teamFilterCount = (teamTabTeamId ? 1 : 0) + (teamTabOwnerId ? 1 : 0);

  // Fiscal year list — DB-scoped via shared hook
  const { years: fyYears, configured: fyConfigured } = useFiscalYears();
  const availableYears = fyYears.length ? fyYears : [CURRENT_YEAR];

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const selectCls = "px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-accent-400 bg-white text-gray-700";
  const tabCls = (active: boolean) =>
    `px-4 py-2 text-xs font-medium border-b-2 transition-colors ${active ? "border-accent-600 text-accent-600" : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"}`;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 md:px-6 py-3.5 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-sm font-semibold text-gray-800">Dashboard</h1>
          {currentWeek !== null && (
            <span className="text-[11px] bg-accent-50 text-accent-600 border border-accent-100 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
              {quarter} · Week {currentWeek}{currentWeekRange ? ` · ${currentWeekRange}` : ""}
            </span>
          )}
          {/* AvgKPICard moved into the KPI Overview container header — see KPIOverviewContainer */}
        </div>
        <div className="flex items-center gap-2">
          {/* Reload — revalidates all dashboard data in place (no page reload).
              Visible on both tabs. Matches the toolbar button styling (Filter
              button pattern): same border, padding, text size, hover, and
              accent theming. Spins + disables while a refresh is in flight. */}
          <button
            type="button"
            onClick={handleReload}
            disabled={reloadBusy}
            aria-label="Reload dashboard data"
            aria-busy={reloadBusy}
            title="Reload dashboard data"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className={`h-3.5 w-3.5 ${reloadBusy ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:inline">{reloadBusy ? "Reloading…" : "Reload"}</span>
          </button>

          {/* Filter button — only on Team tab. My Dashboard is locked to current user. */}
          {activeTab === "team" && (
            <div className="relative" ref={filterRef}>
              <button
                onClick={() => setShowFilter(o => !o)}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors ${showFilter || teamFilterCount > 0 ? "border-accent-300 bg-accent-50 text-accent-600" : "border-gray-200 text-gray-600"}`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                </svg>
                {teamFilterCount > 0 ? `${teamFilterCount} filter${teamFilterCount > 1 ? "s" : ""}` : "Filter"}
              </button>

              {showFilter && (
                <div
                  // Stop mousedown from bubbling to the document-level
                  // click-outside handler. Without this, picking an option in
                  // the inner FilterPicker dropdown races with React's
                  // unmount of that button and the outer popover closes too
                  // — leaving users unable to set multiple filters in one
                  // session. Clicks truly outside this panel still bubble
                  // through and close as expected.
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4"
                >
                  {/* A — Team scope */}
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Team</p>
                    <FilterPicker
                      value={teamTabTeamId}
                      onChange={(v) => { setTeamTabTeamId(v); setTeamTabOwnerId(""); }}
                      options={teams.map(t => ({ value: t.id, label: t.name }))}
                      allLabel="All Users"
                    />
                  </div>
                  {/* B — KPI type. Only renders when the user can view BOTH
                      Individual KPI and Team KPI; otherwise the toggle is
                      pointless and `teamTabKpiType` is force-synced above. */}
                  {showKpiTypeToggle && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">KPI Type</p>
                      <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
                        {(["individual", "team"] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTeamTabKpiType(t)}
                            className={`flex-1 px-2 py-1 text-[11px] font-medium rounded-md transition-all ${
                              teamTabKpiType === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                            }`}
                          >
                            {t === "individual" ? "Individual KPI" : "Team KPI"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* C — Owner. Picking an owner is treated as the "done"
                      signal for the filter step — committing it auto-closes
                      the popover so the user gets immediate feedback that
                      the filter is applied. Team + KPI Type selections keep
                      the popover open so users can still narrow further. */}
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Owner</p>
                    <FilterPicker
                      value={teamTabOwnerId}
                      onChange={(v) => {
                        setTeamTabOwnerId(v);
                        setShowFilter(false);
                      }}
                      options={ownerOptions.map(userToFilterOption)}
                      selectedOption={selectedOwnerOption}
                      onSearchChange={setOwnerSearch}
                      onLoadMore={fetchMoreOwners}
                      hasMore={ownersHasMore}
                      loadingMore={ownersLoadingMore}
                      loading={ownersLoading}
                      allLabel="All Users"
                    />
                  </div>
                  {(teamTabTeamId || teamTabOwnerId || teamTabKpiType !== "individual") && (
                    <button
                      onClick={() => {
                        setTeamTabTeamId("");
                        setTeamTabOwnerId("");
                        setTeamTabKpiType("individual");
                      }}
                      className="w-full text-xs text-gray-500 hover:text-gray-800 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Global More pill — Export/Trash/Manage Cols across sections */}
          <DashboardMoreActions
            kpis={kpis as any}
            priorities={priorities as any}
            wwws={wwwItems as any}
            fiscalLabel={`FY${year}-${quarter}`}
            trashSections={dashTrashSections}
            onChangeTrashSections={setDashTrashSections}
          />

          {/* Year / Quarter picker — shared FiscalPeriodPicker, DB-scoped */}
          <FiscalPeriodPicker
            years={availableYears}
            configured={fyConfigured}
            year={year}
            quarter={quarter as FiscalQuarter}
            formatYear={fiscalYearLabel}
            onChange={({ year: y, quarter: q }) => { setYear(y); setQuarter(q); }}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4 md:px-6 flex-shrink-0">
        <button className={tabCls(activeTab === "individual")} onClick={() => setActiveTab("individual")}>
          My Dashboard
        </button>
        <button className={tabCls(activeTab === "team")} onClick={() => setActiveTab("team")}>
          Team
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 space-y-5 min-h-0">

        {/* KPI overview cards — collapsed by default, click header to expand.
            Gate stays true while the session is still resolving so the card
            doesn't flicker out when the summary query wins the refresh race —
            see kpiOverviewVisible. */}
        {kpiOverviewVisible(isLoading, sessionStatus, kpis.length) && (
          <KPIOverviewContainer count={kpis.length} loading={kpisLoading} kpis={kpis} currentWeek={currentWeek} weekCount={weekCount}>
            {/* Cap the grid at ~4 card rows and scroll vertically. overflow-x
                is clipped so a long card set never produces a horizontal
                scrollbar; pr-1 keeps the vertical scrollbar off the cards. */}
            <div
              className="grid gap-3 pt-3 overflow-y-auto overflow-x-hidden pr-1"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", maxHeight: 420 }}
            >
              {kpisLoading
                ? [1, 2, 3, 4].map(i => (
                    <div key={i} className="bg-white border border-gray-200 rounded-xl px-4 py-3 animate-pulse">
                      <div className="h-2 bg-gray-100 rounded w-3/4 mb-3" />
                      <div className="h-4 bg-gray-100 rounded w-1/2 mb-2" />
                      <div className="h-1.5 bg-gray-100 rounded w-full" />
                    </div>
                  ))
                : (
                  <UnreadCountsProvider entityType="KPI" ids={kpis.map(k => k.id)}>
                    {kpis.map(k => <KPICard key={k.id} kpi={k} currentWeek={currentWeek} weekCount={weekCount} numberFormat={numberFormat} />)}
                  </UnreadCountsProvider>
                )
              }
            </div>
          </KPIOverviewContainer>
        )}

        <Section
          badge="KPI"
          count={kpiTotal}
          right={
            <div className="flex items-center gap-2">
              <TableSearchInput value={kpiSearchInput} onChange={setKpiSearchInput} placeholder="Search KPIs" />
              {kpiHiddenSet.size > 0 && (
                <HiddenColsMenu
                  hiddenCols={kpiHiddenSet}
                  allCols={kpiAllCols}
                  onShow={kpiPrefs.showCol}
                />
              )}
            </div>
          }
        >
          {kpiTableLoading ? <Spinner /> : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <KPITable
                kpis={kpiRows}
                year={year}
                quarter={quarter}
                onSort={handleKpiSort}
                sortBy={kpiSortBy}
                sortOrder={kpiSortOrder}
                onRefresh={() => { void kpiTableQuery.refetch(); }}
                fillWidth
                numberFormat={numberFormat}
                maxBodyHeight={DASHBOARD_TABLE_MAX_HEIGHT}
                hasMore={kpiTableQuery.hasNextPage}
                isFetchingMore={kpiTableQuery.isFetchingNextPage}
                onLoadMore={kpiTableQuery.fetchNextPage}
                hideColumns={[
                  // On the Team tab the owner column shown follows the KPI Type
                  // toggle: individual KPIs carry a single `owner`, team KPIs
                  // carry multiple `ownerIds` (`kpiOwner`). See dashboardColumns.
                  ...dashboardKpiHiddenColumns(activeTab, teamTabKpiType),
                  ...hiddenWeekCols,
                ]}
              />
            </div>
          )}
        </Section>

        <Section
          badge="Priority"
          count={priTotal}
          right={
            <div className="flex items-center gap-2">
              <TableSearchInput value={priSearchInput} onChange={setPriSearchInput} placeholder="Search priorities" />
              {priorityPrefs.hiddenCols.length > 0 && (
                <HiddenColsPill
                  hiddenCols={priorityPrefs.hiddenCols}
                  colLabels={PRIORITY_DASH_COL_LABELS}
                  onRestore={priorityPrefs.showCol}
                  onRestoreAll={priorityPrefs.showAllCols}
                />
              )}
            </div>
          }
        >
          {priTableLoading ? <Spinner /> : (
            // No `overflow-hidden` here — PriorityTable already wraps itself
            // in HorizontalScroller, which IS the correct scroll context for
            // its sticky frozen columns. Clipping at this outer layer
            // prevented the inner sticky cascade from ever triggering when
            // the column widths exceeded the dashboard container.
            <div className="bg-white border border-gray-200 rounded-xl">
              <PriorityTable
                priorities={priRows}
                onRefresh={() => { void priTableQuery.refetch(); }}
                year={year}
                quarter={quarter}
                fillWidth
                sortBy={priSortBy}
                sortOrder={priSortOrder}
                onSort={handlePriSort}
                maxBodyHeight={DASHBOARD_TABLE_MAX_HEIGHT}
                hasMore={priTableQuery.hasNextPage}
                isFetchingMore={priTableQuery.isFetchingNextPage}
                onLoadMore={priTableQuery.fetchNextPage}
                hideColumns={[
                  ...(activeTab === "team"
                    ? ["_cb", "_log", "_id", "owner"]
                    : ["_cb", "_log", "_id", "team", "owner"]),
                  ...hiddenWeekCols,
                ]}
                readOnly
              />
            </div>
          )}
        </Section>

        {/* WWW section — visible on both tabs. Source already respects active
            tab + team-tab filter chain (A team scope + C owner). */}
        <Section
          badge="WWW"
          count={wwwTotal}
          right={
            <>
              <TableSearchInput value={wwwSearchInput} onChange={setWwwSearchInput} placeholder="Search WWW" />
              {wwwPrefs.hiddenCols.length > 0 && (
                <HiddenColsPill
                  hiddenCols={wwwPrefs.hiddenCols}
                  colLabels={WWW_DASH_COL_LABELS}
                  onRestore={wwwPrefs.showCol}
                  onRestoreAll={wwwPrefs.showAllCols}
                />
              )}
              <StatusMultiSelect
                selected={wwwStatusFilter}
                onChange={setWwwStatusFilter}
                buttonClass={selectCls}
              />
            </>
          }
        >
          {wwwTableLoading ? <Spinner /> : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <WWWTable
                items={wwwRows}
                onRefresh={() => { void wwwTableQuery.refetch(); }}
                hideColumns={["_cb", "_log", "_id"]}
                readOnly
                sortBy={wwwSortBy}
                sortOrder={wwwSortOrder}
                onSort={handleWwwSort}
                maxBodyHeight={DASHBOARD_TABLE_MAX_HEIGHT}
                hasMore={wwwTableQuery.hasNextPage}
                isFetchingMore={wwwTableQuery.isFetchingNextPage}
                onLoadMore={wwwTableQuery.fetchNextPage}
              />
            </div>
          )}
        </Section>

      </div>
    </div>
  );
}
