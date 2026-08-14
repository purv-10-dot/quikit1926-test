"use client";

/**
 * Stacked bar: one bar per group, segments = count of Critical Numbers in each
 * of the 4 health tiers. Counting follows the exact `byTeam` grouping pattern
 * from `performance/talent/DashboardView.tsx` — Quadrant(A/B/C/D) →
 * CriticalTier(great/good/concerned/bad).
 *
 * The group dimension is switchable between Category and Department via the
 * header toggle (`groupBy`). "Department" is `teamName` — QsTeam fulfils that
 * role, per the schema note on CriticalNumber.teamId.
 */

import { useMemo, useState } from "react";
import { Segmented } from "@quikit/ui";
import { resolveTargetTier, CRITICAL_TIER_LABELS, type CriticalTier } from "@/lib/utils/criticalNumberTiers";
import { TIER_HEX } from "../tierPalette";
import type { PreviewCriticalNumber } from "./types";

type GroupBy = "category" | "department";

const ORDERED_TIERS: CriticalTier[] = ["great", "good", "concerned", "bad"];

/** Matches the bands `resolveTargetTier` actually applies (via KPI's `getColorByPercentage`). */
const TIER_PERCENT_LABEL: Record<CriticalTier, string> = {
  great: "≥120%",
  good: "≥100%",
  concerned: "≥80%",
  bad: "<80%",
};
const TICK_STEP = 2;
const ROW_H = 44;
const BAR_H = 20;
const AXIS_H = 20;
/** Rows beyond this scroll inside a fixed-height viewport — the axis below stays put. */
const VISIBLE_ROWS = 5;

interface Props {
  records: PreviewCriticalNumber[];
}

export function CategoryTierChart({ records }: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>("category");

  const distribution = useMemo(() => {
    const byGroup = new Map<string, Record<CriticalTier, number>>();
    let noStatus = 0;
    for (const cn of records) {
      const { tier } = resolveTargetTier(cn);
      if (!tier) {
        noStatus++;
        continue;
      }
      const key = groupBy === "category" ? cn.categoryName : cn.teamName;
      const row = byGroup.get(key) ?? { great: 0, good: 0, concerned: 0, bad: 0 };
      row[tier]++;
      byGroup.set(key, row);
    }
    const categories = Array.from(byGroup.entries())
      .map(([name, counts]) => ({
        name,
        counts,
        total: counts.great + counts.good + counts.concerned + counts.bad,
      }))
      .sort((a, b) => b.total - a.total);
    return { categories, noStatus };
  }, [records, groupBy]);

  const rawMax = Math.max(1, ...distribution.categories.map((c) => c.total));
  // Default 0–10 scale (the common case); only stretched past 10 when a
  // group actually needs it, keeping the fixed step-of-2 gridlines.
  const scaleMax = Math.max(10, Math.ceil(rawMax / TICK_STEP) * TICK_STEP);
  const ticks: number[] = [];
  for (let t = 0; t <= scaleMax; t += TICK_STEP) ticks.push(t);

  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5 h-full flex flex-col">
      <header className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 tracking-tight">
            Critical Numbers by {groupBy === "category" ? "category" : "department"}
          </h3>
          <p className="text-[11px] text-gray-500 mt-0.5">Count in each health tier</p>
        </div>
        <Segmented
          value={groupBy}
          onChange={setGroupBy}
          options={[
            { value: "category", label: "Category" },
            { value: "department", label: "Department" },
          ]}
          className="w-auto shrink-0"
        />
      </header>

      {/* Rows viewport — scrolls once the group count exceeds VISIBLE_ROWS; the
          axis below lives outside this container so it never scrolls with it. */}
      <div
        className="flex gap-3 overflow-y-auto pr-1"
        style={{ maxHeight: VISIBLE_ROWS * ROW_H }}
      >
        {/* Labels column */}
        <div className="w-40 shrink-0">
          {distribution.categories.map((cat) => (
            <div key={cat.name} className="flex flex-col justify-center" style={{ height: ROW_H }}>
              <span className="text-xs font-medium text-gray-800 truncate" title={cat.name}>
                {cat.name}
              </span>
              <span className="text-[11px] text-gray-400 mt-0.5">
                {cat.total} Critical Number{cat.total === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>

        {/* Bars column */}
        <div className="flex-1 relative min-w-0" style={{ height: distribution.categories.length * ROW_H }}>
          {/* Vertical gridlines, spanning every bar row */}
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute top-0 bottom-0 border-l border-gray-100"
              style={{ left: `${(t / scaleMax) * 100}%` }}
            />
          ))}

          {distribution.categories.map((cat) => (
            <div key={cat.name} className="relative flex items-center" style={{ height: ROW_H }}>
              <div className="w-full rounded-md overflow-hidden bg-gray-50 flex" style={{ height: BAR_H }}>
                {ORDERED_TIERS.map((t) => {
                  const count = cat.counts[t];
                  if (count === 0) return null;
                  const pct = (count / scaleMax) * 100;
                  return (
                    <div
                      key={t}
                      className="h-full flex items-center justify-center text-[10px] font-semibold text-white"
                      style={{ width: `${pct}%`, backgroundColor: TIER_HEX[t] }}
                      title={`${CRITICAL_TIER_LABELS[t]}: ${count}`}
                    >
                      {count}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* X-axis — fixed below the (possibly scrolling) rows, same left offset
          as the bars column so ticks stay aligned regardless of scroll position. */}
      <div className="flex gap-3 mt-1">
        <div className="w-40 shrink-0" />
        <div className="flex-1 relative min-w-0 border-t border-gray-200" style={{ height: AXIS_H }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute top-1.5 -translate-x-1/2 text-[10px] text-gray-400 tabular-nums"
              style={{ left: `${(t / scaleMax) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Legend, below the x-axis */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-gray-500 flex-wrap mt-3">
        {ORDERED_TIERS.map((t) => (
          <span key={t} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TIER_HEX[t] }} />
            {CRITICAL_TIER_LABELS[t]} ({TIER_PERCENT_LABEL[t]})
          </span>
        ))}
      </div>

      {distribution.noStatus > 0 && (
        <p className="mt-3 text-[11px] text-gray-400 text-center">
          {distribution.noStatus} Critical Number{distribution.noStatus === 1 ? "" : "s"} excluded — no
          status yet
        </p>
      )}
    </section>
  );
}
