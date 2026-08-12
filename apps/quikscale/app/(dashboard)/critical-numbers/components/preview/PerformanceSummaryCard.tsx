"use client";

/**
 * MOCK-DATA PREVIEW — embedded in the real Critical Numbers page
 * (critical-numbers/page.tsx), pending real API wiring.
 *
 * Multi-segment donut + legend, same 4-tier counting as `CategoryTierChart`
 * but flattened across all categories into one ring. No stacked/segmented
 * donut exists elsewhere in quikscale (the house style is single-value rings
 * — see `CriticalNumberCard`'s gauge / the dashboard's `AvgKPICard`), so the
 * multi-arc math here is new: each tier gets `strokeDasharray`/`strokeDashoffset`
 * sized to its share of the circle, drawn in the same order as the bar
 * chart's legend, rotated -90° to start at 12 o'clock like every other gauge
 * in this feature.
 *
 * "Overall Performance" = the share of classified Critical Numbers that are
 * Achieved or better (meeting or exceeding target) — the single headline
 * number the donut's centre carries.
 */

import { useMemo } from "react";
import { resolveTargetTier, CRITICAL_TIER_LABELS, type CriticalTier } from "@/lib/utils/criticalNumberTiers";
import { TIER_HEX } from "../tierPalette";
import type { PreviewCriticalNumber } from "./types";

const ORDERED_TIERS: CriticalTier[] = ["great", "good", "concerned", "bad"];

const SIZE = 160;
const STROKE = 18;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

interface Props {
  records: PreviewCriticalNumber[];
}

export function PerformanceSummaryCard({ records }: Props) {
  const { segments, total, overallPct, noStatus } = useMemo(() => {
    const counts: Record<CriticalTier, number> = { great: 0, good: 0, concerned: 0, bad: 0 };
    let noStatus = 0;
    for (const cn of records) {
      const { tier } = resolveTargetTier(cn);
      if (!tier) {
        noStatus++;
        continue;
      }
      counts[tier]++;
    }
    const total = counts.great + counts.good + counts.concerned + counts.bad;

    let cumulative = 0;
    const segments = ORDERED_TIERS.map((t) => {
      const count = counts[t];
      const frac = total > 0 ? count / total : 0;
      const seg = { tier: t, count, pct: total > 0 ? Math.round((count / total) * 100) : 0, dash: frac * CIRC, offset: -cumulative * CIRC };
      cumulative += frac;
      return seg;
    });

    const overallPct = total > 0 ? Math.round(((counts.great + counts.good) / total) * 100) : 0;
    return { segments, total, overallPct, noStatus };
  }, [records]);

  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5 h-full flex flex-col">
      <header className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 tracking-tight">Performance Summary</h3>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="relative" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#f1f5f9" strokeWidth={STROKE} />
            {segments.map(
              (s) =>
                s.count > 0 && (
                  <circle
                    key={s.tier}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={R}
                    fill="none"
                    stroke={TIER_HEX[s.tier]}
                    strokeWidth={STROKE}
                    strokeDasharray={`${s.dash} ${CIRC - s.dash}`}
                    strokeDashoffset={s.offset}
                  />
                ),
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold tracking-tight tabular-nums text-gray-900">
              {overallPct}%
            </span>
            <span className="text-[11px] text-gray-500 text-center mt-0.5">Overall Performance</span>
          </div>
        </div>

        <div className="w-full mt-5 space-y-2.5">
          {segments.map((s) => (
            <div key={s.tier} className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 text-gray-700">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TIER_HEX[s.tier] }} />
                {CRITICAL_TIER_LABELS[s.tier]} ({s.count})
              </span>
              <span className="font-semibold text-gray-900 tabular-nums">{s.pct}%</span>
            </div>
          ))}
        </div>

        {noStatus > 0 && (
          <p className="mt-3 text-[11px] text-gray-400 text-center">
            {noStatus} excluded — no status yet
          </p>
        )}
        {total === 0 && <p className="mt-3 text-xs text-gray-400 text-center">No data yet</p>}
      </div>
    </section>
  );
}
