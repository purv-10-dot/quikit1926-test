"use client";

/**
 * StatsTab — read-only stats view for a KPI, used in LogModal.
 *
 * QTD semantics (per product decision 2026-04):
 *   QTD Goal     = Σ weekly goals for weeks [1 .. currentWeek-1]
 *                  (exclusive of the current week — "what you were
 *                   supposed to have hit by the start of this week")
 *   QTD Achieved = Σ weekly actuals for the same range, shown as
 *                  `achieved / goal` so you see both at a glance.
 *
 * If no currentWeek can be resolved (year+quarter has not started yet,
 * or has already ended, or is malformed), we fall back to the full-
 * quarter totals — matching the pre-rule behaviour so historical
 * KPIs still render something sensible.
 */

import type { KPIRow } from "@/lib/types/kpi";
import { fmt, formatScaledKpiValue, getProgressBadgeColors } from "@/lib/utils/kpiHelpers";
import { computeKPIStats, computeQtd, weeklyGoalTile, resolvePace } from "./kpiStats";
import { FormulaTooltip } from "./FormulaTooltip";
import {
  explainQtr,
  explainWeeksReported,
  explainAvgPerWeek,
  explainBestWeek,
  explainQuarterlyGoal,
  explainQtdGoal,
  explainQtdAchieved,
  explainWeeklyGoal,
  type FormulaExplain,
} from "./kpiFormulaTooltips";
import { useQtdReferenceWeek, useQuarterWeekCount } from "@/lib/hooks/useCurrentWeek";

export function StatsTab({ kpi }: { kpi: KPIRow }) {
  // Scaled-display: when the KPI's toggle is on, currency values render in the
  // scale unit (₹ Cr); otherwise raw full numbers (today's behaviour).
  const scaledStat = kpi.measurementUnit === "Currency" && !!kpi.scaledDisplay && !!kpi.targetScale;
  // Number KPI unit-of-measure (from Unit Master, e.g. "lb") — appended to full
  // numbers so Stats reads "16 lb", "2 / 13 lb".
  const numberUnit = kpi.measurementUnit === "Number" ? (kpi.unit ?? "") : "";
  const fmtStat = (v: number | null | undefined): string => {
    if (scaledStat)
      return formatScaledKpiValue(v, {
        measurementUnit: kpi.measurementUnit,
        currency: kpi.currency,
        targetScale: kpi.targetScale,
        scaledDisplay: true,
      });
    const base = fmt(v);
    return numberUnit && v != null ? `${base} ${numberUnit}` : base;
  };
  // The KPI's quarterly goal, using the same fallback chain as the "Quarterly
  // Goal" column on the grids (quarterlyGoal ?? target ?? qtdGoal). Only used
  // to detect a zero-target KPI now — the Overall Progress panel below divides
  // by `resolvePace`'s goal instead. See kpiStats.ts `kpiQtrPercent`.
  const target = kpi.quarterlyGoal ?? kpi.target ?? kpi.qtdGoal ?? 0;
  // Standalone vs Cumulative — drives both the QTD tile math AND the Overall
  // Progress panel below. Defaults to Cumulative (schema default).
  const divisionType: "Cumulative" | "Standalone" =
    kpi.divisionType === "Standalone" ? "Standalone" : "Cumulative";
  // Weeks in this KPI's quarter (Custom Quarter Settings). Defaults to 13.
  const weekCount = useQuarterWeekCount(kpi.year, kpi.quarter);
  const { filledWeeks, avgPerWeek, bestWeek, bestValue } = computeKPIStats(kpi, weekCount);

  // QTD reference week — past/current/future aware. For a fully-past quarter
  // this is `weekCount + 1` so QTD counts ALL completed weeks (the clamped
  // display week would drop the final week). See `qtdReferenceWeek`. Drives
  // both the QTD totals and the Weekly Goal tile (last completed week) below.
  const qtdWeek = useQtdReferenceWeek(kpi.year, kpi.quarter);

  // Compute QTD totals over the completed weeks. Falls back to full-quarter
  // totals when the reference week is unresolvable.
  const { qtdGoal, qtdAchieved } = computeQtd(kpi, qtdWeek, divisionType, weekCount);

  // Overall Progress = achieved-to-date ÷ the full quarter's potential, via the
  // SAME `resolvePace` that draws the Dashboard KPI Overview card's QTR bar and
  // the Progress column on both KPI grids — one helper, one definition of
  // "progress", every surface.
  //
  // The panel prints BOTH numbers from this pair (`{achieved} of {goal}`), not
  // the quarterly-goal pair, so the headline percentage always divides out of
  // the two figures next to it. For a Standalone KPI those are the raw sum and
  // `target × weekCount` (540 of 1,040 = 52%) rather than the per-week average
  // against the per-week target (135 of 80 = 169%, which is what this panel
  // used to print while the dashboard QTR bar said 52%). The 135 and the 80 are
  // still on screen — as the "QTD Achieved" and "Quarterly Goal" tiles below.
  //
  // Cumulative is unaffected: `resolvePace` delegates to
  // `resolveProgressOverall` for Cumulative KPIs, so those render exactly as
  // before. Neither division reads the server-stamped `kpi.qtdAchieved` (it
  // counts the in-progress week — see `recalcKPI` in
  // api/kpi/[id]/weekly/batch/route.ts).
  const { achieved, goal: qtrGoal } = resolvePace(kpi, qtdWeek, weekCount);
  // Badge-colors helper — runs the canonical `getColorByPercentage`
  // internally and maps the result to READABLE-on-white text tones plus
  // a human status label. Use it because the percentage label here sits
  // on a white panel (not a colored cell).
  const pct = qtrGoal > 0 ? (achieved / qtrGoal) * 100 : 0;
  const hasAnyWeeklyValue = (kpi.weeklyValues ?? []).some((wv) => wv.value != null);
  // Gate on `hasAnyWeeklyValue`, matching the grids and the dashboard card: a
  // KPI with no logged week renders the neutral gray state. (The old gate was
  // `kpi.qtdAchieved != null`, a server column that is 0 — not null — for
  // untouched KPIs, so they rendered as a red 0%.)
  const colors = hasAnyWeeklyValue
    ? getProgressBadgeColors(achieved, qtrGoal, hasAnyWeeklyValue, kpi.reverseColor ?? false)
    : { bar: "bg-gray-300", text: "text-gray-500", label: "—" };

  // Weekly Goal tile shows "<last completed week's value> / <that week's target>".
  // The completed week is derived from the QTD reference week (qtdWeek - 1), so a
  // fully-past quarter correctly reflects its FINAL week instead of dropping it
  // — the clamped display week used to point one week too early. See weeklyGoalTile.
  const weeklyTile = weeklyGoalTile(kpi, qtdWeek, weekCount);
  // Zero-target KPI: every week's goal is a real 0, so show "0" rather than "—".
  const isZeroTargetKPI = target === 0;
  const weeklyGoalDisplay = (() => {
    if (weeklyTile == null) return "—";
    const valueStr = weeklyTile.value != null ? fmtStat(weeklyTile.value) : "—";
    const targetStr = weeklyTile.target > 0
      ? fmtStat(weeklyTile.target)
      : isZeroTargetKPI ? fmtStat(0) : "—";
    if (valueStr === "—" && targetStr === "—") return "—";
    return `${valueStr} / ${targetStr}`;
  })();

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-3">
          Overall Progress
        </h3>
        {/* The whole panel is one hover target — it explains the SAME
            `resolvePace` formula the grids' Progress column uses, so the two
            surfaces read identically. */}
        <FormulaTooltip explain={explainQtr(kpi, qtdWeek, weekCount)} triggerClassName="block">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div className="flex items-end justify-between mb-3">
              <div>
                <div className={`text-3xl font-bold ${colors.text}`}>
                  {pct.toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{colors.label}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Achieved</div>
                <div className="text-lg font-semibold text-gray-800">
                  {fmtStat(achieved)}
                </div>
                <div className="text-[10px] text-gray-400">
                  of {fmtStat(qtrGoal)} target
                </div>
              </div>
            </div>
            <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all ${colors.bar}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        </FormulaTooltip>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {([
          {
            label: "Weeks Reported",
            value: String(filledWeeks.length),
            sub: undefined,
            explain: explainWeeksReported(kpi, weekCount),
          },
          {
            label: "Avg / Week",
            value: fmtStat(avgPerWeek),
            sub: undefined,
            explain: explainAvgPerWeek(kpi, weekCount),
          },
          {
            label: "Best Week",
            value: bestWeek ? `W${bestWeek}` : "—",
            // Sub-label surfaces the achieved value for the best-performing
            // week so the stat reads like "W1 — 4.45" instead of a bare label.
            sub: bestWeek ? fmtStat(bestValue) : undefined,
            explain: explainBestWeek(kpi, weekCount),
          },
        ] as Array<{ label: string; value: string; sub?: string; explain: FormulaExplain }>).map((s) => (
          <FormulaTooltip key={s.label} explain={s.explain} triggerClassName="block">
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-center">
              <div className="text-lg font-semibold text-gray-800">
                {s.value}
                {s.sub != null && (
                  <span className="text-xs font-normal text-gray-500 ml-1.5">· {s.sub}</span>
                )}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
            </div>
          </FormulaTooltip>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          {
            label: "Quarterly Goal",
            value: kpi.quarterlyGoal != null ? fmtStat(kpi.quarterlyGoal) : "—",
            explain: explainQuarterlyGoal(kpi),
          },
          {
            label: "QTD Goal",
            value: qtdGoal != null ? fmtStat(qtdGoal) : "—",
            explain: explainQtdGoal(kpi, qtdWeek, weekCount),
          },
          {
            label: "QTD Achieved",
            // Format "achieved / goal" so the user sees progress at a glance.
            value:
              qtdGoal != null
                ? `${fmtStat(qtdAchieved ?? 0)} / ${fmtStat(qtdGoal)}`
                : fmtStat(qtdAchieved ?? 0),
            explain: explainQtdAchieved(kpi, qtdWeek, weekCount),
          },
          {
            label: "Weekly Goal",
            value: weeklyGoalDisplay,
            explain: explainWeeklyGoal(kpi, qtdWeek, weekCount),
          },
        ].map((s) => (
          <FormulaTooltip key={s.label} explain={s.explain} triggerClassName="block">
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-center">
              <div className="text-lg font-semibold text-gray-800">{s.value}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
            </div>
          </FormulaTooltip>
        ))}
      </div>
    </div>
  );
}

