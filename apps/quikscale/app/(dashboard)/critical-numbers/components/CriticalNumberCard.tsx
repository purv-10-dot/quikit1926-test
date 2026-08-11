"use client";

/**
 * Display card for one Critical Number — hero gauge, current value, tier, and
 * a trend area beneath.
 *
 * The gauge is the same hand-rolled SVG donut technique as the dashboard's
 * `AvgKPICard` (two stacked circles, `strokeDasharray` for the arc, rotated
 * -90° so it starts at 12 o'clock), scaled from 28px to hero size. quikscale
 * ships no charting library, so SVG is the house style — see `TrendChart`.
 *
 * The arc and the colour now answer the SAME question — progress against
 * target — so a fuller ring is always a better ring. v1's time-based mode could
 * show a 20%-full ring in green (on pace, early in the window); that mode and
 * the "expected today" tick it needed are both gone.
 */

import { Plus, TrendingUp } from "lucide-react";
import { resolveTargetTier, CRITICAL_TIER_LABELS } from "@/lib/utils/criticalNumberTiers";
import type { CriticalNumberFrequency, MeasurementUnit } from "@/lib/schemas/criticalNumberSchema";
// Same fixed list + scale math KPI's card/modal use — reused, not duplicated.
import { CURRENCIES, getMultiplier, scaleDownForDisplay } from "@/lib/utils/currency";
import { TIER_HEX, TIER_CLASSES, TIER_UNKNOWN } from "./tierPalette";
import { ComboTrendChart } from "./preview/ComboTrendChart";

/** Human copy for each reason a tier can't be resolved. */
const REASON_COPY: Record<string, string> = {
  "no-data": "No updates recorded yet",
  "no-target": "No target set",
};

const FREQUENCY_LABELS: Record<CriticalNumberFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

function formatValue(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/**
 * Suffix the readout with what the number MEANS. Percentage is
 * self-describing; Currency has its own prefix (the symbol) handled
 * separately below, not a suffix. For Number the optional Unit Master label
 * is used when present.
 */
function unitSuffix(measurementUnit: MeasurementUnit, unit: string | null): string {
  if (measurementUnit === "Percentage") return "%";
  if (measurementUnit === "Number" && unit) return ` ${unit}`;
  return "";
}

/** The ₹/$/€ symbol for a Currency metric's chosen code, or "" if none is set. */
function currencySymbol(measurementUnit: MeasurementUnit, currency: string | null): string {
  if (measurementUnit !== "Currency" || !currency) return "";
  return CURRENCIES.find((c) => c.code === currency)?.symbol ?? "";
}

export interface CriticalNumberCardProps {
  record: {
    id: string;
    title: string;
    targetValue: number;
    currentValue: number | null;
    measurementUnit: MeasurementUnit;
    unit: string | null;
    currency: string | null;
    targetScale: string | null;
    frequency: CriticalNumberFrequency;
    teamName?: string;
    ownerName?: string;
    categoryName?: string | null;
    subCategoryName?: string | null;
    /** Bounded recent history (oldest-first), from the list endpoint's batched
     *  include — see `RECENT_HISTORY_LIMIT` in api/critical-numbers/route.ts.
     *  Fewer than 2 points (or omitted, e.g. the preview popup's own gauge
     *  usage) keeps the placeholder below instead of an unplottable chart. */
    updates?: { date: string; value: number }[];
  };
  onAddUpdate?: () => void;
}

export function CriticalNumberCard({ record, onAddUpdate }: CriticalNumberCardProps) {
  const result = resolveTargetTier(record);
  const tier = result.tier;

  const hex = tier ? TIER_HEX[tier] : TIER_UNKNOWN.hex;
  const chip = tier ? TIER_CLASSES[tier] : TIER_UNKNOWN;
  const label = tier ? CRITICAL_TIER_LABELS[tier] : "No status";

  const current = typeof record.currentValue === "number" ? record.currentValue : null;
  const suffix = unitSuffix(record.measurementUnit, record.unit);
  const prefix = currencySymbol(record.measurementUnit, record.currency);
  // `ComboTrendChart` itself won't plot fewer than 2 points — checked here
  // too so the placeholder copy below stays accurate instead of rendering
  // nothing silently.
  const hasTrend = (record.updates?.length ?? 0) >= 2;

  // Display-scaling — always on once a scale is chosen (no separate raw/
  // scaled toggle here, unlike KPI's `scaledDisplay`). The STORED values stay
  // raw; this only changes what's rendered. `getMultiplier` returns 1 for "no
  // scale", so `isScaled` naturally stays false until a real one is picked.
  const scaleMultiplier =
    record.measurementUnit === "Currency" && record.currency && record.targetScale
      ? getMultiplier(record.currency, record.targetScale)
      : 1;
  const isScaled = scaleMultiplier > 1;

  function scaledFormat(v: number | null): string {
    if (v === null) return "—";
    if (isScaled && record.currency && record.targetScale) {
      return scaleDownForDisplay(v, record.currency, record.targetScale);
    }
    return formatValue(v);
  }

  // Arc fill = progress toward target, clamped to one full turn. Over-achievers
  // sit at a complete blue ring; the percentage below carries the overshoot.
  const pct =
    current !== null && record.targetValue > 0
      ? Math.min(Math.max(current / record.targetValue, 0), 1)
      : 0;

  // Donut geometry — same construction as AvgKPICard, bigger radius. Sized so
  // several cards fit on screen at once; the readout below still sets the
  // minimum, so don't shrink much further without dropping the type scale too.
  const SIZE = 132;
  const STROKE = 11;
  const R = (SIZE - STROKE) / 2;
  const CIRC = 2 * Math.PI * R;
  const dash = pct * CIRC;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900 truncate">{record.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {record.teamName ?? "—"}
            {record.ownerName ? ` · ${record.ownerName}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${chip.bg} ${chip.border} ${chip.text}`}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: hex }} />
          {label}
        </span>
      </div>

      {/* Classification — category › sub-category, plus cadence */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50/60">
        <span className="text-[11px] text-gray-600 truncate">
          {record.categoryName ?? "Uncategorised"}
          {record.subCategoryName ? ` › ${record.subCategoryName}` : ""}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-gray-500">
          {FREQUENCY_LABELS[record.frequency]}
        </span>
      </div>

      {/* Gauge */}
      <div className="px-4 py-4 flex flex-col items-center">
        <div className="relative" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} className="-rotate-90">
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#f1f5f9" strokeWidth={STROKE} />
            {pct > 0 && (
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={hex}
                strokeWidth={STROKE}
                strokeDasharray={`${dash} ${CIRC}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.4s ease, stroke 0.3s ease" }}
              />
            )}
          </svg>
          {/* Centre readout */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tracking-tight tabular-nums text-gray-900">
              {current !== null && prefix && (
                <span className="text-sm font-semibold text-gray-400">{prefix}</span>
              )}
              {scaledFormat(current)}
              {current !== null && isScaled && (
                <span className="text-sm font-semibold text-gray-400"> {record.targetScale}</span>
              )}
              {current !== null && suffix && (
                <span className="text-sm font-semibold text-gray-400">{suffix}</span>
              )}
            </span>
            <span className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
              of {prefix}
              {scaledFormat(record.targetValue)}
              {isScaled && ` ${record.targetScale}`}
              {suffix}
            </span>
          </div>
        </div>

        {result.percentage !== null && (
          <p className="mt-3 text-xs text-gray-500 tabular-nums">
            <span className="font-semibold text-gray-800">
              {Math.round(result.percentage)}%
            </span>{" "}
            of target
          </p>
        )}

        {!tier && result.reason && (
          <p className="mt-3 text-xs text-gray-400">{REASON_COPY[result.reason] ?? "No status"}</p>
        )}

        <button
          type="button"
          onClick={onAddUpdate}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent-700 bg-accent-50 border border-accent-200 rounded-lg hover:bg-accent-100 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" /> Add past update
        </button>
      </div>

      {/* Trend — the list endpoint's batched `updates` include (last 8,
          oldest-first). Falls back to a placeholder below 2 points, since
          that's not enough to plot a line against. */}
      <div className="border-t border-gray-100 px-4 py-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Trend
          </span>
        </div>
        {hasTrend ? (
          <ComboTrendChart
            compact
            record={{
              title: record.title,
              categoryName: record.categoryName ?? "Uncategorised",
              frequency: record.frequency,
              targetValue: record.targetValue,
              history: record.updates!,
            }}
          />
        ) : (
          <div className="h-20 rounded-lg bg-gray-50 border border-dashed border-gray-200 flex flex-col items-center justify-center gap-1.5 px-4 text-center">
            <TrendingUp className="h-5 w-5 text-gray-300" />
            <span className="text-xs text-gray-400">Log a couple of updates to see your trend here</span>
          </div>
        )}
      </div>
    </div>
  );
}
