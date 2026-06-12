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
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString() : String(value);
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
}: {
  result: ReportResult | null;
  loading: boolean;
  error: string | null;
  filterCaption?: string;
  onExport?: (format: "csv" | "xlsx") => void;
  exportDisabled?: boolean;
}) {
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
        <>
          {result.total && (
            <div className="flex items-baseline gap-2 text-sm">
              <span className="text-crm-muted">{result.total.label}:</span>
              <span className="font-semibold text-crm-text">
                {result.total.display ?? result.total.value.toLocaleString()}
              </span>
            </div>
          )}

          <div className="crm-card overflow-hidden">
            <TableScroll minWidth={540} bleed={false}>
              <Table>
                <THead>
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
        </>
      )}

      {onExport && (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-crm-border pt-3">
          <button
            type="button"
            onClick={() => onExport("csv")}
            disabled={exportDisabled || !result || loading}
            className="inline-flex h-9 items-center rounded-md border border-crm-border bg-white px-3 text-sm font-medium hover:border-accent-400 hover:bg-accent-50 hover:text-accent-700 disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => onExport("xlsx")}
            disabled={exportDisabled || !result || loading}
            className="inline-flex h-9 items-center rounded-md border border-crm-border bg-white px-3 text-sm font-medium hover:border-accent-400 hover:bg-accent-50 hover:text-accent-700 disabled:opacity-50"
          >
            Export Excel
          </button>
        </div>
      )}
    </div>
  );
}
