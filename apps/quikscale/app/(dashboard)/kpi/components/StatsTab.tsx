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
import { progressColor, fmt } from "@/lib/utils/kpiHelpers";
import { computeKPIStats } from "./kpiStats";
import { useCurrentWeek } from "@/lib/hooks/useCurrentWeek";

export function StatsTab({ kpi }: { kpi: KPIRow }) {
  const colors = progressColor(kpi.progressPercent ?? 0);
  // kpi.target is the user-set quarterly target; kpi.qtdGoal is a derived aggregate
  // that can lag behind after a target edit. Use kpi.target as the primary.
  const target = kpi.target ?? kpi.qtdGoal ?? 0;
  const achieved = kpi.qtdAchieved ?? 0;
  const { filledWeeks, avgPerWeek, bestWeek } = computeKPIStats(kpi);

  // Week-of-quarter (1..13) — DB-driven, respects tenant's QuarterSetting.
  const currentWeek = useCurrentWeek(kpi.year, kpi.quarter);

  // Compute QTD totals over [1 .. currentWeek-1]. Falls back to full-quarter
  // totals when currentWeek is unresolvable.
  const { qtdGoal, qtdAchieved } = computeQtd(kpi, currentWeek);

  // Weekly Goal tile shows "<latest reported value> / <that week's target>".
  // We look at the most recent week (≤ currentWeek when known, else any week)
  // that has a non-null actual entered. If nothing's been entered yet, fall
  // back to "— / <current-week target>" so the tile still shows a target.
  const weekAvg = target > 0 ? target / 13 : 0;
  const wt = kpi.weeklyTargets ?? {};
  const weekTargetFor = (w: number): number => {
    const raw = wt[String(w)];
    // Use the saved per-week target as-is (including explicit 0).
    // Fall back to the flat average only when no per-week breakdown exists (undefined).
    return typeof raw === "number" ? raw : weekAvg;
  };

  // Weekly Goal = (currentWeek-1) actual value / (currentWeek-1) target.
  const prevWeek = currentWeek != null && currentWeek > 1 ? currentWeek - 1 : null;
  const prevWeekValue = prevWeek != null
    ? ((kpi.weeklyValues ?? []).find(v => v.weekNumber === prevWeek)?.value ?? null)
    : null;
  const prevWeekTarget = prevWeek != null ? weekTargetFor(prevWeek) : 0;
  const weeklyGoalDisplay = (() => {
    if (prevWeek == null) return "—";
    const valueStr = prevWeekValue != null ? fmt(prevWeekValue) : "—";
    const targetStr = prevWeekTarget > 0 ? fmt(prevWeekTarget) : "—";
    if (valueStr === "—" && targetStr === "—") return "—";
    return `${valueStr} / ${targetStr}`;
  })();

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs font-semibold text-gray-700 mb-3">
          Overall Progress
        </h3>
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className={`text-3xl font-bold ${colors.text}`}>
                {(kpi.progressPercent ?? 0).toFixed(0)}%
              </div>
              <div className="text-xs text-gray-500 mt-0.5">{colors.label}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Achieved</div>
              <div className="text-lg font-semibold text-gray-800">
                {fmt(achieved)}
              </div>
              <div className="text-[10px] text-gray-400">
                of {fmt(target)} target
              </div>
            </div>
          </div>
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all ${colors.bar}`}
              style={{ width: `${Math.min(kpi.progressPercent ?? 0, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Weeks Reported", value: String(filledWeeks.length) },
          { label: "Avg / Week", value: fmt(avgPerWeek) },
          { label: "Best Week", value: bestWeek ? `W${bestWeek}` : "—" },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-center"
          >
            <div className="text-lg font-semibold text-gray-800">{s.value}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          {
            label: "Quarterly Goal",
            value: kpi.quarterlyGoal != null ? String(kpi.quarterlyGoal) : "—",
          },
          {
            label: "QTD Goal",
            value: qtdGoal != null ? fmt(qtdGoal) : "—",
          },
          {
            label: "QTD Achieved",
            // Format "achieved / goal" so the user sees progress at a glance.
            value:
              qtdGoal != null
                ? `${fmt(qtdAchieved ?? 0)} / ${fmt(qtdGoal)}`
                : fmt(qtdAchieved ?? 0),
          },
          {
            label: "Weekly Goal",
            value: weeklyGoalDisplay,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-center"
          >
            <div className="text-lg font-semibold text-gray-800">{s.value}</div>
            <div className="text-[10px] text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Compute QTD Goal + QTD Achieved as sums over [1 .. currentWeek-1].
 *
 *   - Uses `kpi.weeklyTargets` (per-week goal map) when present; falls back
 *     to an even split of the total target across 13 weeks.
 *   - Uses `kpi.weeklyValues` actuals, filtered to weeks < currentWeek.
 *
 * Falls back to the server-stored kpi.qtdGoal / qtdAchieved when currentWeek
 * is null (e.g. quarter has ended) so historical KPIs still look right.
 */
function computeQtd(kpi: KPIRow, currentWeek: number | null): {
  qtdGoal: number | null;
  qtdAchieved: number | null;
} {
  if (currentWeek == null) {
    return {
      qtdGoal: kpi.target ?? kpi.qtdGoal ?? null,
      qtdAchieved: kpi.qtdAchieved ?? null,
    };
  }

  // Week 1 → no prior weeks → everything is 0 (not null — we know the answer).
  if (currentWeek <= 1) {
    return { qtdGoal: 0, qtdAchieved: 0 };
  }

  const priorWeeks = Array.from({ length: currentWeek - 1 }, (_, i) => i + 1);

  // QTD Goal: prefer per-week breakdown; fall back to even split.
  // Treat an explicit 0 the same as "not set" — buildBreakdown zeroes out weeks
  // before firstEditableWeek (KPI created mid-quarter), so using those 0s as
  // intentional targets would make QTD Goal = 0 even when a real target exists.
  const wt = kpi.weeklyTargets ?? {};
  const totalTarget = kpi.target ?? kpi.qtdGoal ?? 0;
  const flat = totalTarget > 0 ? totalTarget / 13 : 0;
  const goal = priorWeeks.reduce((sum, w) => {
    const v = wt[String(w)];
    // Use actual per-week target (including explicit 0 for weeks with no target).
    // Fall back to flat rate only when no breakdown exists at all (undefined).
    return sum + (typeof v === "number" ? v : flat);
  }, 0);

  // QTD Achieved: sum of actuals from prior weeks only.
  const wv = kpi.weeklyValues ?? [];
  const achieved = wv
    .filter((v) => v.weekNumber < currentWeek)
    .reduce((sum, v) => sum + (v.value ?? 0), 0);

  return { qtdGoal: goal, qtdAchieved: achieved };
}
