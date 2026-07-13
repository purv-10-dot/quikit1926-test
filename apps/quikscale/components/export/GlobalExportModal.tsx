"use client";

/**
 * GlobalExportModal — one reusable export dialog for every module.
 *
 * The content is DYNAMIC per module (see docs/global-export.md):
 *   - `columns`   the module's exportable columns (checkbox grid).
 *   - `rangeMode` swaps the "interval" control:
 *       week        → From Week / To Week (KPI / Team KPI / Priority)
 *       date        → From / To date      (WWW / Daily Huddle / Weekly Meeting)
 *       createdDate → optional created-at range + "All time" (master data)
 *       none        → no interval control
 *
 * Exports are Excel (.xlsx) only. It collects the selection and hands it to
 * `onExport`; each page turns that into a server export-route URL and downloads
 * the file.
 *
 * Rendered via a portal to <body> so it always sits above the dashboard header
 * (which owns a `z-[100]` stacking context) regardless of where in the page
 * tree it is mounted.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download } from "lucide-react";
import { cn } from "@/lib/utils";

export type RangeMode = "quarter" | "week" | "date" | "createdDate" | "none";

export const ALL_QUARTERS = ["Q1", "Q2", "Q3", "Q4"] as const;

export type GlobalExportRange =
  | { mode: "quarter"; year: number; quarters: string[] }
  | { mode: "week"; fromWeek: number; toWeek: number }
  | { mode: "date"; from: string; to: string }
  | { mode: "createdDate"; from: string; to: string; allTime: boolean }
  | { mode: "none" };

/** Exports are Excel (.xlsx) only. */
export interface GlobalExportSelection {
  columnKeys: string[];
  range: GlobalExportRange;
}

export interface GlobalExportColumn {
  key: string;
  label: string;
}

interface GlobalExportModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  columns: GlobalExportColumn[];
  defaultCheckedKeys: string[];
  rangeMode: RangeMode;
  /** Quarter context (rangeMode="quarter"): year dropdown + Q1-Q4/Full Year. */
  quarterCtx?: { years: number[]; defaultYear: number; defaultQuarter: string; formatYear?: (y: number) => string };
  /** Week-range context (rangeMode="week"). */
  weekCtx?: { weekCount: number; currentWeek?: number; weekLabels?: string[] };
  /** Shown as a locked chip next to the week range, e.g. "2026–2027 · Q1". */
  periodLabel?: string;
  /** Date-range defaults (rangeMode="date" | "createdDate"), "YYYY-MM-DD". */
  dateCtx?: { defaultFrom?: string; defaultTo?: string };
  onExport: (sel: GlobalExportSelection) => Promise<void> | void;
}

export function GlobalExportModal({
  open,
  onClose,
  title = "Export Data",
  columns,
  defaultCheckedKeys,
  rangeMode,
  quarterCtx,
  weekCtx,
  periodLabel,
  dateCtx,
  onExport,
}: GlobalExportModalProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set(defaultCheckedKeys));
  const [busy, setBusy] = useState(false);

  const weekCount = weekCtx?.weekCount ?? 13;
  const defaultToWeek = weekCtx?.currentWeek && weekCtx.currentWeek > 0 ? weekCtx.currentWeek : weekCount;

  const [fromWeek, setFromWeek] = useState(1);
  const [toWeek, setToWeek] = useState(defaultToWeek);
  const [fromDate, setFromDate] = useState(dateCtx?.defaultFrom ?? "");
  const [toDate, setToDate] = useState(dateCtx?.defaultTo ?? "");
  const [allTime, setAllTime] = useState(false);
  // "quarter" mode: a fiscal year + a single quarter or "FULL" (all four).
  const [quarterYear, setQuarterYear] = useState(quarterCtx?.defaultYear ?? new Date().getFullYear());
  const [quarterSel, setQuarterSel] = useState<string>(quarterCtx?.defaultQuarter ?? "Q1");

  // Reset all fields whenever the dialog (re)opens so a prior session's picks
  // don't leak into a fresh export.
  useEffect(() => {
    if (!open) return;
    setChecked(new Set(defaultCheckedKeys));
    setFromWeek(1);
    setToWeek(defaultToWeek);
    setFromDate(dateCtx?.defaultFrom ?? "");
    setToDate(dateCtx?.defaultTo ?? "");
    setAllTime(rangeMode === "createdDate");
    setQuarterYear(quarterCtx?.defaultYear ?? new Date().getFullYear());
    setQuarterSel(quarterCtx?.defaultQuarter ?? "Q1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const weekNums = useMemo(
    () => Array.from({ length: weekCount }, (_, i) => i + 1),
    [weekCount],
  );

  if (!open || typeof document === "undefined") return null;

  const toggle = (k: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  const selectAll = () => setChecked(new Set(columns.map((c) => c.key)));
  const clearAll = () => setChecked(new Set());

  const buildRange = (): GlobalExportRange => {
    switch (rangeMode) {
      case "quarter":
        return {
          mode: "quarter",
          year: quarterYear,
          quarters: quarterSel === "FULL" ? [...ALL_QUARTERS] : [quarterSel],
        };
      case "week":
        return { mode: "week", fromWeek, toWeek };
      case "date":
        return { mode: "date", from: fromDate, to: toDate };
      case "createdDate":
        return { mode: "createdDate", from: allTime ? "" : fromDate, to: allTime ? "" : toDate, allTime };
      default:
        return { mode: "none" };
    }
  };

  const weekLabel = (w: number) => {
    const lbl = weekCtx?.weekLabels?.[w - 1];
    return lbl ? `Week ${w} · ${lbl}` : `Week ${w}`;
  };

  const go = async () => {
    if (checked.size === 0) return;
    setBusy(true);
    try {
      await onExport({
        columnKeys: columns.filter((c) => checked.has(c.key)).map((c) => c.key),
        range: buildRange(),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[88vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-500">Choose an interval and columns.</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Interval / range */}
          {rangeMode !== "none" && (
            <div className="px-5 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Interval</div>
                {periodLabel && rangeMode === "week" && (
                  <span className="text-[11px] bg-accent-50 text-accent-700 border border-accent-100 px-2 py-0.5 rounded-full font-medium">
                    {periodLabel}
                  </span>
                )}
              </div>

              {rangeMode === "quarter" && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-sm">
                    <label className="text-gray-500 text-xs w-10">Year</label>
                    <select
                      aria-label="Fiscal year"
                      value={quarterYear}
                      onChange={(e) => setQuarterYear(Number(e.target.value))}
                      className="border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-400"
                    >
                      {(quarterCtx?.years ?? [quarterYear]).map((y) => (
                        <option key={y} value={y}>
                          {quarterCtx?.formatYear ? quarterCtx.formatYear(y) : y}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-gray-500 text-xs w-10">Quarter</span>
                    {[...ALL_QUARTERS, "FULL"].map((q) => {
                      const on = quarterSel === q;
                      return (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setQuarterSel(q)}
                          className={cn(
                            "px-2.5 py-1 rounded-md border text-xs font-medium",
                            on ? "border-accent-300 bg-accent-50 text-accent-800" : "border-gray-200 text-gray-600 hover:bg-gray-50",
                          )}
                        >
                          {q === "FULL" ? "Full Year" : q}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {rangeMode === "week" && (
                <div className="flex items-center gap-2 text-sm">
                  <label className="text-gray-500 text-xs">From</label>
                  <select
                    aria-label="From week"
                    value={fromWeek}
                    onChange={(e) => setFromWeek(Number(e.target.value))}
                    className="border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-400"
                  >
                    {weekNums.map((w) => (
                      <option key={w} value={w}>{weekLabel(w)}</option>
                    ))}
                  </select>
                  <label className="text-gray-500 text-xs">to</label>
                  <select
                    aria-label="To week"
                    value={toWeek}
                    onChange={(e) => setToWeek(Number(e.target.value))}
                    className="border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-400"
                  >
                    {weekNums.map((w) => (
                      <option key={w} value={w}>{weekLabel(w)}</option>
                    ))}
                  </select>
                </div>
              )}

              {(rangeMode === "date" || rangeMode === "createdDate") && (
                <div className="space-y-2">
                  {rangeMode === "createdDate" && (
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allTime}
                        onChange={(e) => setAllTime(e.target.checked)}
                        className="accent-[var(--accent-600,#0066cc)]"
                      />
                      All time
                    </label>
                  )}
                  <div className={cn("flex items-center gap-2 text-sm", allTime && "opacity-40 pointer-events-none")}>
                    <label className="text-gray-500 text-xs">From</label>
                    <input
                      type="date"
                      aria-label="From date"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-400"
                    />
                    <label className="text-gray-500 text-xs">to</label>
                    <input
                      type="date"
                      aria-label="To date"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                      className="border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-accent-400"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Columns */}
          <div className="px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Columns ({checked.size}/{columns.length})
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={selectAll} className="text-xs text-accent-700 hover:text-accent-800 font-medium">
                  Select all
                </button>
                <span className="text-gray-300 text-xs">·</span>
                <button type="button" onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-700 font-medium">
                  Clear
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {columns.map((c) => {
                const on = checked.has(c.key);
                return (
                  <label
                    key={c.key}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer border text-sm",
                      on ? "border-accent-300 bg-accent-50 text-accent-800" : "border-gray-200 bg-white text-gray-500",
                    )}
                  >
                    <input type="checkbox" checked={on} onChange={() => toggle(c.key)} className="accent-[var(--accent-600,#0066cc)]" />
                    {c.label}
                  </label>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={go}
            disabled={busy || checked.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {busy ? "Exporting…" : "Export .xlsx"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
