"use client";

/**
 * Shared canned/custom report result renderer (chart + table + exports).
 */
import Link from "next/link";
import { CannedReportChart } from "./canned-report-chart";
import {
  Table,
  TableScroll,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";

export type ReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: "number" | "currency" | "date" | "percent" | "duration";
};

export type ReportResult = {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  total?: { label: string; value: number; display?: string };
  chart?: { type: "bar" | "line" | "pie"; xKey: string; yKey: string };
};

function formatCell(value: unknown, fmt?: ReportColumn["format"]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (fmt === "currency") {
    const n = Number(value);
    return Number.isFinite(n)
      ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n)
      : String(value);
  }
  if (fmt === "number") {
    // Indian-style grouping for quantity columns only (count, score sum/avg).
    // Percent/date/duration/currency have their own branches above; IDs, year
    // buckets, and dimension labels carry no `format` and fall through to
    // String() below — so "2025" and UUIDs are never grouped.
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString("en-IN") : String(value);
  }
  if (fmt === "percent") {
    const n = Number(value);
    return Number.isFinite(n) ? `${n}%` : String(value);
  }
  if (fmt === "duration") {
    const s = Number(value);
    if (!Number.isFinite(s) || s <= 0) return "00:00:00";
    const sec = Math.floor(s);
    const hh = Math.floor(sec / 3600);
    const mm = Math.floor((sec % 3600) / 60);
    const ss = sec % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }
  if (fmt === "date") {
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString();
  }
  return String(value);
}

export function CannedReportView({
  result,
  loading,
  error,
  filterCaption,
  onExport,
  exportDisabled,
  canExport = true,
}: {
  result: ReportResult | null;
  loading: boolean;
  error: string | null;
  filterCaption?: string;
  onExport?: (format: "csv" | "xlsx") => void;
  exportDisabled?: boolean;
  /**
   * Whether the signed-in user holds `reports.export`. Resolved server-side
   * and threaded down so we disable the buttons (with a tooltip) instead of
   * letting a click navigate the tab to a raw 403 JSON page.
   */
  canExport?: boolean;
}) {
  const exportBlocked = !canExport;
  const exportTitle = exportBlocked ? "Export permission required" : undefined;
  return (
    <div className="space-y-4">
      {filterCaption && (
        <div className="rounded-md border border-accent-200 bg-accent-50 px-3 py-1.5 text-xs text-accent-700">
          {filterCaption}
        </div>
      )}

      {result?.chart && (
        <CannedReportChart
          type={result.chart.type}
          xKey={result.chart.xKey}
          yKey={result.chart.yKey}
          rows={result.rows}
          valueFormat={
            result.columns.find((c) => c.key === result.chart?.yKey)?.format
          }
        />
      )}

      {loading && (
        <div className="rounded border border-dashed border-crm-border p-6 text-center text-sm text-crm-muted">
          Loading report…
        </div>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && !loading && !error && (
        <div className="crm-card overflow-hidden">
            {/* Header stays put above the internally-scrolling table, so the
                total + export are always reachable on long reports. */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-crm-border px-3 py-2">
              <div className="text-sm">
                {result.total ? (
                  <>
                    <span className="text-crm-muted">{result.total.label}: </span>
                    <span className="font-semibold text-crm-text">
                      {result.total.display ?? result.total.value.toLocaleString()}
                    </span>
                  </>
                ) : (
                  <span className="text-crm-muted">
                    {result.rows.length} {result.rows.length === 1 ? "row" : "rows"}
                  </span>
                )}
              </div>
              {onExport && (
                <div className="flex items-center gap-2">
                  {exportBlocked && (
                    <span className="text-xs text-crm-muted">Export needs permission</span>
                  )}
                  <button
                    type="button"
                    onClick={() => onExport("csv")}
                    disabled={exportBlocked || exportDisabled}
                    title={exportTitle}
                    className="inline-flex h-8 items-center rounded-md border border-crm-border bg-white px-2.5 text-xs font-medium hover:border-accent-400 hover:bg-accent-50 hover:text-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => onExport("xlsx")}
                    disabled={exportBlocked || exportDisabled}
                    title={exportTitle}
                    className="inline-flex h-8 items-center rounded-md border border-crm-border bg-white px-2.5 text-xs font-medium hover:border-accent-400 hover:bg-accent-50 hover:text-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Export Excel
                  </button>
                </div>
              )}
            </div>
            <TableScroll
              minWidth={540}
              bleed={false}
              className="max-h-[55vh] overflow-y-auto"
            >
              <Table>
                <THead className="sticky top-0 z-10 bg-crm-panel">
                  <TR>
                    {result.columns.map((c) => (
                      <TH key={c.key} className={c.align === "right" ? "text-right" : ""}>
                        {c.label}
                      </TH>
                    ))}
                  </TR>
                </THead>
                <TBody>
                  {result.rows.length === 0 ? (
                    <TR>
                      <TD
                        colSpan={result.columns.length}
                        className="py-6 text-center text-crm-muted"
                      >
                        No rows match the current filters.
                      </TD>
                    </TR>
                  ) : (
                    result.rows.map((row, i) => {
                      const drill =
                        typeof row._drillUrl === "string" ? (row._drillUrl as string) : null;
                      return (
                        <TR key={i}>
                          {result.columns.map((c, ci) => {
                            const cell = formatCell(row[c.key], c.format);
                            const isDimension = ci === 0;
                            return (
                              <TD
                                key={c.key}
                                className={c.align === "right" ? "text-right" : ""}
                              >
                                {isDimension && drill ? (
                                  <Link
                                    href={drill}
                                    className="text-accent-700 hover:underline"
                                  >
                                    {cell}
                                  </Link>
                                ) : (
                                  cell
                                )}
                              </TD>
                            );
                          })}
                        </TR>
                      );
                    })
                  )}
                </TBody>
              </Table>
            </TableScroll>
          </div>
      )}
    </div>
  );
}
