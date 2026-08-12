"use client";

/**
 * MOCK-DATA PREVIEW — embedded in the real Critical Numbers page
 * (critical-numbers/page.tsx), pending real API wiring.
 *
 * Activity-feed style card, styled after the reference screenshot (icon +
 * title + value/percent, "Updated By" and time-ago as their own trailing
 * columns). Aggregates EVERY record's full history into one list, newest
 * first — the "which Critical Number, what reading, who logged it, how long
 * ago" view, rather than one record's own history (that's what the detail
 * popup's "Update history" table already covers).
 *
 * The list scrolls inside a fixed-height card rather than growing. That
 * height is a PROP, not a guessed constant — `ComboTrendChart`'s fixed
 * aspect ratio won't flex to fill a taller sibling, so the caller measures
 * the chart card's actual rendered height (ResizeObserver) and passes it in,
 * guaranteeing pixel parity instead of an eyeballed number that drifts the
 * moment either card's padding/header/legend wraps differently.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { resolveTargetTier } from "@/lib/utils/criticalNumberTiers";
import { TIER_CLASSES, TIER_UNKNOWN } from "../tierPalette";
import { CURRENCIES, getMultiplier, scaleDownForDisplay } from "@/lib/utils/currency";
import type { MeasurementUnit } from "@/lib/schemas/criticalNumberSchema";
import type { PreviewCriticalNumber } from "./types";

/** Used only until the caller's measurement lands (first paint). */
const FALLBACK_HEIGHT = 380;

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

/** Coarse "time ago" — the mock history only carries a date, not a time of day. */
function timeAgo(iso: string): string {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  const months = Math.floor(diffDays / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  return `${Math.floor(months / 12)}y ago`;
}

interface Props {
  records: PreviewCriticalNumber[];
  /** Exact pixel height to match, measured by the caller from its sibling. */
  height?: number;
}

export function RecentUpdatesCard({ records, height }: Props) {
  const recent = useMemo(() => {
    return records
      .flatMap((r) => r.history.map((h) => ({ ...h, record: r })))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [records]);

  // Fade edges, same visual language as `HorizontalScroller`'s left/right
  // fades — just top/bottom, since this list scrolls vertically. Recomputed
  // on scroll and once the row count is known (mount).
  const listRef = useRef<HTMLDivElement>(null);
  const [{ canScrollUp, canScrollDown }, setEdges] = useState({ canScrollUp: false, canScrollDown: false });

  const recalcEdges = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setEdges({
      canScrollUp: el.scrollTop > 2,
      canScrollDown: el.scrollTop < el.scrollHeight - el.clientHeight - 2,
    });
  }, []);

  useEffect(() => {
    recalcEdges();
  }, [recalcEdges, recent.length]);

  return (
    <section
      className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5 flex flex-col"
      style={{ height: height ?? FALLBACK_HEIGHT }}
    >
      <h3 className="text-sm font-semibold text-gray-900 tracking-tight mb-3 shrink-0">Recent Updates</h3>

      {recent.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center flex-1">No updates logged yet.</p>
      ) : (
        <div className="relative flex-1 min-h-0">
          <div
            ref={listRef}
            onScroll={recalcEdges}
            className="h-full overflow-y-auto divide-y divide-gray-100 pr-1"
          >
          {recent.map((entry, i) => {
            const { record } = entry;
            const { tier, percentage } = resolveTargetTier({
              currentValue: entry.value,
              targetValue: record.targetValue,
            });
            const chip = tier ? TIER_CLASSES[tier] : TIER_UNKNOWN;
            const prefix = currencySymbol(record.measurementUnit, record.currency);
            const suffix = unitSuffix(record.measurementUnit, record.unit);
            const scaleMultiplier =
              record.measurementUnit === "Currency" && record.currency && record.targetScale
                ? getMultiplier(record.currency, record.targetScale)
                : 1;
            const isScaled = scaleMultiplier > 1;
            const fmt =
              isScaled && record.currency && record.targetScale
                ? scaleDownForDisplay(entry.value, record.currency, record.targetScale)
                : formatValue(entry.value);

            return (
              <div key={`${record.id}-${entry.date}-${i}`} className="flex items-center gap-3 py-2.5">
                <span className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${chip.bg}`}>
                  <Activity className={`h-4 w-4 ${chip.text}`} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate" title={record.title}>
                    {record.title} updated
                  </p>
                  <p className="text-xs text-gray-500 tabular-nums">
                    {prefix}
                    {fmt}
                    {isScaled && ` ${record.targetScale}`}
                    {suffix}
                    {percentage !== null && ` (${Math.round(percentage)}%)`}
                  </p>
                </div>
                <span className="w-24 shrink-0 text-xs text-gray-500 text-right truncate" title={entry.createdBy}>
                  {entry.createdBy ?? "—"}
                </span>
                <span className="w-20 shrink-0 text-xs text-gray-400 text-right whitespace-nowrap">
                  {timeAgo(entry.date)}
                </span>
              </div>
            );
          })}
          </div>

          {canScrollUp && (
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 right-0 h-6"
              style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.95), rgba(255,255,255,0))" }}
            />
          )}
          {canScrollDown && (
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-0 left-0 right-0 h-6"
              style={{ background: "linear-gradient(to top, rgba(255,255,255,0.95), rgba(255,255,255,0))" }}
            />
          )}
        </div>
      )}
    </section>
  );
}
