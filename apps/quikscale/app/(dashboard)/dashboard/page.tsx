"use client";

import { useState, useRef, useEffect, useMemo, CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useKPIs } from "@/lib/hooks/useKPI";
import { usePriorities } from "@/lib/hooks/usePriority";
import { useWWWItems } from "@/lib/hooks/useWWW";
import { useUsers } from "@/lib/hooks/useUsers";
import { useFilterContext } from "@/lib/context/FilterContext";
import { FilterPicker, userToFilterOption } from "@/components/FilterPicker";
import type { KPIRow } from "@/lib/types/kpi";
import type { PriorityRow } from "@/lib/types/priority";
import type { WWWItem } from "@/lib/types/www";
import {
  getFiscalYear, getFiscalQuarter, fiscalYearLabel,
  weekDateLabel, ALL_WEEKS, getCurrentFiscalWeek,
} from "@/lib/utils/fiscal";
import { progressColor, weekCellColors, fmt, fmtCompact } from "@/lib/utils/kpiHelpers";

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENT_YEAR = getFiscalYear();
const FISCAL_YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

// Shared week column definition used by KPI and Priority sections
const WEEK_COLS: ColDef[] = ALL_WEEKS.map(w => ({ key: `w${w}`, label: `Week ${w}`, width: 64 }));

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; bg: string }> = {
  "not-applicable":  { label: "Not Applicable",  bg: "bg-gray-400"  },
  "not-yet-started": { label: "Not Yet Started", bg: "bg-red-500"   },
  "behind-schedule": { label: "Behind Schedule", bg: "bg-amber-400" },
  "on-track":        { label: "On Track",        bg: "bg-green-500" },
  "completed":       { label: "Completed",       bg: "bg-blue-500"  },
};

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch { return "—"; }
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
    <svg className="h-3 w-3 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function DateCell({ iso }: { iso?: string | null }) {
  return (
    <div className="flex items-center gap-1.5">
      <CalendarIcon />
      <span className="text-xs text-blue-600">{formatDate(iso)}</span>
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

function Section({ badge, count, children }: { badge: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm" style={{ overflow: "clip" }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
        <span className="text-xs font-bold text-white bg-gray-800 px-2.5 py-1 rounded-md">{badge}</span>
        {count !== undefined && count > 0 && (
          <span className="text-xs text-gray-400">{count} item{count !== 1 ? "s" : ""}</span>
        )}
      </div>
      {children}
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
    <div className="overflow-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
      <table className="border-separate border-spacing-0" style={{ minWidth: "max-content", tableLayout: "fixed" }}>
        {children}
      </table>
    </div>
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
        <svg className="h-3 w-3 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
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
function WeekTableHead({ staticCols, allCols, frozenUpTo, allColKeys, onFreeze, year, quarter }: {
  staticCols: ColDef[];
  allCols: ColDef[];
  frozenUpTo: string | null;
  allColKeys: string[];
  onFreeze: (key: string | null) => void;
  year: number;
  quarter: string;
}) {
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
        {WEEK_COLS.map(col => (
          <th key={col.key} className={`sticky top-0 z-20 ${TH_BASE}`}
            style={{ ...getStickyStyle(col.key, frozenUpTo, allCols, 20), ...colW(col) }}>
            <div className="flex flex-col items-center px-1 py-1.5 gap-0.5">
              <span>{col.label}</span>
              <span className="text-[9px] font-normal opacity-60">{weekDateLabel(year, quarter, weekNum(col))}</span>
            </div>
          </th>
        ))}
      </tr>
    </thead>
  );
}

// ── KPI mini cards ────────────────────────────────────────────────────────────

function KPICard({ kpi }: { kpi: KPIRow }) {
  const colors = progressColor(kpi.progressPercent ?? 0);
  const achieved = kpi.qtdAchieved ?? 0;
  const goal = kpi.quarterlyGoal ?? kpi.target ?? 0;
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 hover:shadow-sm transition-shadow">
      <p className="text-[11px] text-gray-500 font-medium truncate mb-1.5" title={kpi.name}>{kpi.name}</p>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-base font-bold text-gray-800">{fmtCompact(achieved)}</span>
        <span className="text-xs text-gray-400">/ {fmtCompact(goal)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold ${colors.text}`}>{(kpi.progressPercent ?? 0).toFixed(0)}%</span>
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-1.5 rounded-full ${colors.bar}`} style={{ width: `${Math.min(kpi.progressPercent ?? 0, 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function AvgKPICard({ kpis }: { kpis: KPIRow[] }) {
  const avg = kpis.length
    ? Math.round(kpis.reduce((s, k) => s + (k.progressPercent ?? 0), 0) / kpis.length)
    : 0;
  const onTrack = kpis.filter(k => (k.progressPercent ?? 0) >= 80).length;
  const atRisk  = kpis.filter(k => (k.progressPercent ?? 0) >= 50 && (k.progressPercent ?? 0) < 80).length;
  const behind  = kpis.filter(k => (k.progressPercent ?? 0) < 50).length;

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
      <span className="w-px h-4 bg-gray-300" />
      {/* Breakdown */}
      <div className="flex items-center gap-3">
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

const ALL_KPI_COLS: ColDef[] = [...KPI_COLS, ...WEEK_COLS];

function KPISection({ kpis, year, quarter }: { kpis: KPIRow[]; year: number; quarter: string }) {
  const [frozenUpTo, setFrozenUpTo] = useState<string | null>("name");
  const [page, setPage] = useState(1);
  const allColKeys = ALL_KPI_COLS.map(c => c.key);
  const paged = kpis.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!kpis.length) return <EmptyState label="No KPI data found" />;

  return (
    <>
    <SectionTable>
      <WeekTableHead
        staticCols={KPI_COLS} allCols={ALL_KPI_COLS}
        frozenUpTo={frozenUpTo} allColKeys={allColKeys} onFreeze={setFrozenUpTo}
        year={year} quarter={quarter}
      />
      <tbody>
        {paged.map((kpi, ri) => {
          const rowBg = ri % 2 === 0 ? "bg-white" : "bg-gray-50";
          const weeklyGoal = (kpi.qtdGoal ?? kpi.target ?? 0) / 13;
          const weekMap: Record<number, number | null> = {};
          const weekNoteMap: Record<number, string | null> = {};
          (kpi.weeklyValues ?? []).forEach(wv => {
            weekMap[wv.weekNumber] = wv.value ?? null;
            weekNoteMap[wv.weekNumber] = wv.notes ?? null;
          });
          const weeklyTargets = kpi.weeklyTargets as Record<string, number> | null | undefined;

          return (
            <tr key={kpi.id} className={`${rowBg} hover:bg-blue-50 transition-colors`}>
              {KPI_COLS.map(col => {
                const sticky = getStickyStyle(col.key, frozenUpTo, ALL_KPI_COLS);
                const frozenBg = getFrozenBg(col.key, frozenUpTo, ALL_KPI_COLS, rowBg);
                const base = `border-r border-b border-gray-100 px-4 py-3 ${frozenBg}`;

                if (col.key === "lastNotes") return (
                  <td key={col.key} className={base} style={{ ...sticky, ...colW(col) }}>
                    <NoteCell text={kpi.lastNotes} />
                  </td>
                );

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
              {WEEK_COLS.map(col => {
                const w = weekNum(col);
                const val = weekMap[w];
                const note = weekNoteMap[w];
                const wTarget = weeklyTargets ? (weeklyTargets[String(w)] ?? 0) : weeklyGoal;
                const { bg, text } = weekCellColors(val, wTarget);
                const frozenBg = getFrozenBg(col.key, frozenUpTo, ALL_KPI_COLS, rowBg);
                return (
                  <td key={col.key}
                    className={`border-r border-b border-gray-100 px-0 py-0 ${bg || frozenBg}`}
                    style={{ ...getStickyStyle(col.key, frozenUpTo, ALL_KPI_COLS), ...colW(col) }}>
                    <WeekCellTooltip
                      label={col.label} dateRange={weekDateLabel(year, quarter, w)}
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

const ALL_PRI_COLS: ColDef[] = [...PRI_COLS, ...WEEK_COLS];

function PrioritySection({ priorities, year, quarter }: { priorities: PriorityRow[]; year: number; quarter: string }) {
  const [frozenUpTo, setFrozenUpTo] = useState<string | null>("name");
  const [page, setPage] = useState(1);
  const allColKeys = ALL_PRI_COLS.map(c => c.key);
  const paged = priorities.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!priorities.length) return <EmptyState label="No Priority data found" />;

  return (
    <>
    <SectionTable>
      <WeekTableHead
        staticCols={PRI_COLS} allCols={ALL_PRI_COLS}
        frozenUpTo={frozenUpTo} allColKeys={allColKeys} onFreeze={setFrozenUpTo}
        year={year} quarter={quarter}
      />
      <tbody>
        {paged.map((p, ri) => {
          const rowBg = ri % 2 === 0 ? "bg-white" : "bg-gray-50";
          const start = p.startWeek ?? 1;
          const end = p.endWeek ?? 13;
          const statusMap: Record<number, string> = {};
          const weekNoteMap: Record<number, string | null> = {};
          p.weeklyStatuses.forEach(ws => {
            statusMap[ws.weekNumber] = ws.status;
            weekNoteMap[ws.weekNumber] = ws.notes ?? null;
          });
          const lastNote = p.weeklyStatuses.slice().reverse().find(ws => ws.notes)?.notes ?? null;

          return (
            <tr key={p.id} className={`${rowBg} hover:bg-blue-50 transition-colors`}>
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
                  startWeek: <span className="text-xs text-gray-500 whitespace-nowrap">Week {start} · {weekDateLabel(year, quarter, start)}</span>,
                  endWeek:   <span className="text-xs text-gray-500 whitespace-nowrap">Week {end} · {weekDateLabel(year, quarter, end)}</span>,
                };

                return (
                  <td key={col.key} className={base} style={{ ...sticky, ...colW(col) }}>
                    {content[col.key]}
                  </td>
                );
              })}
              {WEEK_COLS.map(col => {
                const w = weekNum(col);
                const inRange = w >= start && w <= end;
                const status = statusMap[w] ?? "";
                const meta = STATUS_META[status];
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
                      label={col.label} dateRange={weekDateLabel(year, quarter, w)}
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
    <div className="overflow-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
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
            const statusMeta = STATUS_META[item.status];

            return (
              <tr key={item.id} className={`${rowBg} hover:bg-blue-50 transition-colors`}>
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
    </div>
    <Paginator page={page} total={items.length} onChange={setPage} />
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [quarter, setQuarter] = useState<"Q1" | "Q2" | "Q3" | "Q4">(getFiscalQuarter() as "Q1" | "Q2" | "Q3" | "Q4");
  const { filterTeam, setFilterTeam, filterOwner, setFilterOwner } = useFilterContext();

  // Teams list (reuse the org/teams endpoint)
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    fetch("/api/org/teams").then(r => r.json()).then(d => {
      if (d.success) setTeams(d.data.map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })));
    });
  }, []);

  // Users filtered by selected team (hook refetches when teamId changes)
  const { data: users = [] } = useUsers(filterTeam || undefined);

  // Set of user IDs belonging to the selected team (all org members when no team selected)
  const teamUserIds = useMemo(() => new Set(users.map(u => u.id)), [users]);

  // Effective owner filter: specific owner > all team members > no filter
  const ownerFilter = filterOwner || undefined;

  // pageSize:1000 ensures all KPIs are fetched — needed for correct client-side team filtering
  const { data: kpiData, isLoading: kpiLoading } = useKPIs({ year, quarter, owner: ownerFilter, pageSize: 1000 });
  const allKpis: KPIRow[] = (kpiData?.data ?? []) as KPIRow[];
  // When a team is selected but no specific owner, filter KPIs to team members
  const kpis: KPIRow[] = (filterTeam && !filterOwner)
    ? allKpis.filter(k => teamUserIds.has(k.owner))
    : allKpis;

  const { data: allPriorities = [], isLoading: priLoading } = usePriorities(year, quarter);
  const priorities = filterOwner
    ? allPriorities.filter(p => p.owner === filterOwner)
    : filterTeam
      ? allPriorities.filter(p => teamUserIds.has(p.owner))
      : allPriorities;

  const { data: allWWW = [], isLoading: wwwLoading } = useWWWItems({});
  const wwwItems = filterOwner
    ? allWWW.filter(w => w.who === filterOwner)
    : filterTeam
      ? allWWW.filter(w => teamUserIds.has(w.who))
      : allWWW;

  const currentWeek = getCurrentFiscalWeek(year, quarter);

  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const activeFilterCount = (filterTeam ? 1 : 0) + (filterOwner ? 1 : 0);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const selectCls = "px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white text-gray-700";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-gray-800">Dashboard</h1>
          <span className="text-[11px] bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full font-medium">
            Week {currentWeek}
          </span>
          {!kpiLoading && kpis.length > 0 && <AvgKPICard kpis={kpis} />}
        </div>
        <div className="flex items-center gap-2">
          {/* Filter button */}
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilter(o => !o)}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-md hover:bg-gray-50 transition-colors ${showFilter || activeFilterCount > 0 ? "border-blue-300 bg-blue-50 text-blue-600" : "border-gray-200 text-gray-600"}`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
              </svg>
              {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount > 1 ? "s" : ""}` : "Filter"}
            </button>

            {showFilter && (
              <div className="absolute top-full right-0 mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-4 space-y-4">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Team</p>
                  <FilterPicker
                    value={filterTeam}
                    onChange={setFilterTeam}
                    options={teams.map(t => ({ value: t.id, label: t.name }))}
                    allLabel="All teams"
                  />
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Owner</p>
                  <FilterPicker
                    value={filterOwner}
                    onChange={setFilterOwner}
                    options={users.map(userToFilterOption)}
                    allLabel="All owners"
                  />
                </div>
                {(filterTeam || filterOwner) && (
                  <button
                    onClick={() => { setFilterTeam(""); setFilterOwner(""); }}
                    className="w-full text-xs text-gray-500 hover:text-gray-800 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

          <select value={year} onChange={e => setYear(Number(e.target.value))} className={selectCls}>
            {FISCAL_YEARS.map(y => <option key={y} value={y}>{fiscalYearLabel(y)}</option>)}
          </select>
          <select value={quarter} onChange={e => setQuarter(e.target.value as "Q1" | "Q2" | "Q3" | "Q4")} className={selectCls}>
            {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* KPI overview cards */}
        {(kpiLoading || kpis.length > 0) && (
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">KPI Overview</p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {kpiLoading
                ? [1, 2, 3, 4].map(i => (
                    <div key={i} className="bg-white border border-gray-200 rounded-xl px-4 py-3 animate-pulse">
                      <div className="h-2 bg-gray-100 rounded w-3/4 mb-3" />
                      <div className="h-4 bg-gray-100 rounded w-1/2 mb-2" />
                      <div className="h-1.5 bg-gray-100 rounded w-full" />
                    </div>
                  ))
                : kpis.map(k => <KPICard key={k.id} kpi={k} />)
              }
            </div>
          </div>
        )}

        <Section badge="KPI" count={kpis.length}>
          {kpiLoading ? <Spinner /> : <KPISection kpis={kpis} year={year} quarter={quarter} />}
        </Section>

        <Section badge="Priority" count={priorities.length}>
          {priLoading ? <Spinner /> : <PrioritySection priorities={priorities} year={year} quarter={quarter} />}
        </Section>

        <Section badge="WWW" count={wwwItems.length}>
          {wwwLoading ? <Spinner /> : <WWWSection items={wwwItems} />}
        </Section>

      </div>
    </div>
  );
}
