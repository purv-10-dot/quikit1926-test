"use client";

/**
 * MOCK-DATA PREVIEW — embedded in the real Critical Numbers page
 * (critical-numbers/page.tsx), pending real API wiring.
 *
 * Not one of the 4 CLAUDE.md-locked tables (KPI/Team KPI/Priority/WWW), so
 * the header follows the site-wide rule (`bg-accent-50` on every <th>) and
 * the status/progress cells use the tier palette — same semantic-colour
 * treatment the card and stacked bar already use.
 */

import { useState } from "react";
import { Pagination } from "@quikit/ui";
import { resolveTargetTier, CRITICAL_TIER_LABELS } from "@/lib/utils/criticalNumberTiers";
import { TIER_CLASSES, TIER_HEX, TIER_UNKNOWN } from "../tierPalette";
import { CURRENCIES, getMultiplier, scaleDownForDisplay } from "@/lib/utils/currency";
import type { CriticalNumberFrequency, MeasurementUnit } from "@/lib/schemas/criticalNumberSchema";
import { Sparkline } from "./Sparkline";
import type { PreviewCriticalNumber } from "./types";

const PAGE_SIZE = 10;
/** Below this, the body pads out with blank rows — reserves a consistent
 *  vertical footprint instead of the table looking collapsed at 1 row.
 *  Stays under PAGE_SIZE so a full page never gets padded. */
const MIN_VISIBLE_ROWS = 8;

/**
 * Relative column widths (converted to `%` below), applied via `<colgroup>`
 * + `table-layout: fixed` — so each column keeps the same PROPORTION of
 * whatever width the table actually has, regardless of row count or content
 * length. Auto layout (an earlier attempt) sizes columns off actual cell
 * content instead, so a table with only sparse/short values shrinks and
 * looks cramped no matter what `min-w-*`/`w-full` is set on the `<table>`.
 */
const COLUMNS: { label: string; width: number }[] = [
  { label: "Critical Number", width: 220 },
  { label: "Category / Sub Category", width: 200 },
  { label: "Frequency", width: 110 },
  { label: "Current", width: 110 },
  { label: "Target", width: 110 },
  { label: "Progress", width: 160 },
  { label: "Status", width: 130 },
  { label: "Trend", width: 110 },
  { label: "Last Updated", width: 130 },
];
const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);

const FREQUENCY_LABELS: Record<CriticalNumberFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

function formatValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function unitSuffix(measurementUnit: MeasurementUnit, unit: string | null): string {
  if (measurementUnit === "Percentage") return "%";
  if (measurementUnit === "Number" && unit) return ` ${unit}`;
  return "";
}

function currencySymbol(measurementUnit: MeasurementUnit, currency: string | null): string {
  if (measurementUnit !== "Currency" || !currency) return "";
  return CURRENCIES.find((c) => c.code === currency)?.symbol ?? "";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface Props {
  records: PreviewCriticalNumber[];
  onRowClick?: (record: PreviewCriticalNumber) => void;
  /** Shown in place of rows when `records` is empty — without it, an empty
   *  list would render as nothing but the blank padding rows below. */
  emptyMessage?: string;
}

export function CriticalNumbersTable({ records, onRowClick, emptyMessage }: Props) {
  const [pageRaw, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  // Clamps without a `useEffect` — e.g. if a row is deleted while on the
  // last page, this settles back onto a page that still has rows.
  const page = Math.min(pageRaw, totalPages);
  const visibleRecords = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* `table-layout: fixed` + `<colgroup>` below fix each column's
          RATIO, not its absolute size — with the table itself at `w-full`,
          the browser distributes the card's full width across columns
          using those ratios. So the table always fills the card (no gap),
          and columns keep the same relative proportions (comfortable, not
          content-cramped) whether there's 1 row or 10. `min-w-[Npx]` below
          keeps things readable if the card is ever narrower than that
          (overflow-x-auto handles the scroll then). */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed", minWidth: TABLE_WIDTH }}>
          <colgroup>
            {COLUMNS.map((c) => (
              <col key={c.label} style={{ width: `${(c.width / TABLE_WIDTH) * 100}%` }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-gray-200">
              {COLUMNS.map((c) => (
                <th
                  key={c.label}
                  className="bg-accent-50 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-600 truncate"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibleRecords.map((r) => {
              const { tier, percentage } = resolveTargetTier(r);
              const hex = tier ? TIER_HEX[tier] : TIER_UNKNOWN.hex;
              const chip = tier ? TIER_CLASSES[tier] : TIER_UNKNOWN;
              const label = tier ? CRITICAL_TIER_LABELS[tier] : "No status";
              const prefix = currencySymbol(r.measurementUnit, r.currency);
              const suffix = unitSuffix(r.measurementUnit, r.unit);
              const scaleMultiplier =
                r.measurementUnit === "Currency" && r.currency && r.targetScale
                  ? getMultiplier(r.currency, r.targetScale)
                  : 1;
              const isScaled = scaleMultiplier > 1;
              const fmt = (v: number) =>
                isScaled && r.currency && r.targetScale
                  ? scaleDownForDisplay(v, r.currency, r.targetScale)
                  : formatValue(v);
              const progressPct =
                r.currentValue !== null
                  ? Math.min(100, Math.max(0, (r.currentValue / r.targetValue) * 100))
                  : 0;
              const last = r.history[r.history.length - 1];

              return (
                <tr
                  key={r.id}
                  onClick={() => onRowClick?.(r)}
                  className={onRowClick ? "hover:bg-gray-50 cursor-pointer" : "hover:bg-gray-50"}
                >
                  <td className="px-4 py-3 font-medium text-gray-900 truncate" title={r.title}>
                    {r.title}
                  </td>
                  <td className="px-4 py-3 text-gray-600 truncate">
                    {r.categoryName}
                    {r.subCategoryName && <span className="text-gray-400"> › {r.subCategoryName}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {FREQUENCY_LABELS[r.frequency]}
                  </td>
                  <td className="px-4 py-3 text-gray-900 tabular-nums whitespace-nowrap">
                    {r.currentValue !== null ? (
                      <>
                        {prefix}
                        {fmt(r.currentValue)}
                        {isScaled && ` ${r.targetScale}`}
                        {suffix}
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 tabular-nums whitespace-nowrap">
                    {prefix}
                    {fmt(r.targetValue)}
                    {isScaled && ` ${r.targetScale}`}
                    {suffix}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${progressPct}%`, backgroundColor: hex }}
                        />
                      </div>
                      <span className="text-[11px] text-gray-500 tabular-nums w-9 text-right">
                        {percentage !== null ? `${Math.round(percentage)}%` : "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${chip.bg} ${chip.border} ${chip.text}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: hex }} />
                      {label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Sparkline values={r.history.map((h) => h.value)} color={hex} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {last ? formatDate(last.date) : "—"}
                  </td>
                </tr>
              );
            })}
            {records.length === 0 && emptyMessage && (
              <tr>
                <td className="px-4 py-6 text-center text-xs text-gray-400" colSpan={COLUMNS.length}>
                  {emptyMessage}
                </td>
              </tr>
            )}
            {/* Pad up to MIN_VISIBLE_ROWS with blank rows — same cell
                padding as a real row (`py-3`), so the table always reserves
                a consistent height instead of collapsing around whatever
                few records currently exist. The empty-message row above
                counts as one, so the total height stays the same either way. */}
            {Array.from({
              length: Math.max(
                0,
                MIN_VISIBLE_ROWS - visibleRecords.length - (records.length === 0 && emptyMessage ? 1 : 0),
              ),
            }).map((_, i) => (
              <tr key={`pad-${i}`}>
                <td className="px-4 py-3" colSpan={COLUMNS.length}>
                  &nbsp;
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Only past 10 rows — with one record, a "Page 1 of 1" footer is just
          more empty-looking chrome, not something worth showing. */}
      {records.length > PAGE_SIZE && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={records.length}
          limit={PAGE_SIZE}
          onPageChange={setPage}
        />
      )}
    </section>
  );
}
