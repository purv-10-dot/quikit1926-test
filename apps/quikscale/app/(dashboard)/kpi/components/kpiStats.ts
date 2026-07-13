/**
 * Pure stats computation for a KPI row — extracted from LogModal in R6.
 *
 * Given a `KPIRow` with `weeklyValues`, returns:
 *   - `filledWeeks`  — weeks that have a non-null, non-undefined value
 *   - `avgPerWeek`   — average of filled weeks' values
 *   - `bestWeek`     — week number with the highest value (0 if none)
 *   - `bestValue`    — the achieved value at `bestWeek` (0 if none)
 *
 * Split out so the math can be unit-tested independently of React.
 */

import type { KPIRow, WeeklyValue } from "@/lib/types/kpi";
import { weeksArray, DEFAULT_WEEKS_PER_QUARTER } from "@/lib/utils/fiscal";
import { getColorByPercentage } from "@/lib/utils/colorLogic";
import { computeWeeklyGoal } from "@/lib/utils/kpiHelpers";

export interface KPIStats {
  filledWeeks: number[];
  avgPerWeek: number;
  bestWeek: number;
  bestValue: number;
}

export function computeKPIStats(
  kpi: KPIRow,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): KPIStats {
  const weekMap: Record<number, WeeklyValue> = {};
  (kpi.weeklyValues ?? []).forEach((w) => {
    weekMap[w.weekNumber] = w;
  });

  const filledWeeks = weeksArray(weeksPerQuarter).filter(
    (w) => weekMap[w]?.value !== null && weekMap[w]?.value !== undefined,
  );
  const avgPerWeek =
    filledWeeks.length > 0
      ? filledWeeks.reduce((s, w) => s + (weekMap[w]?.value ?? 0), 0) /
        filledWeeks.length
      : 0;
  const bestWeek = filledWeeks.reduce<number>((best, w) => {
    const v = weekMap[w]?.value ?? 0;
    return v > (weekMap[best]?.value ?? 0) ? w : best;
  }, filledWeeks[0] ?? 0);
  const bestValue = bestWeek > 0 ? (weekMap[bestWeek]?.value ?? 0) : 0;

  return { filledWeeks, avgPerWeek, bestWeek, bestValue };
}

/**
 * QTD Goal + QTD Achieved over weeks [1 .. currentWeek-1].
 *
 * Behavior depends on `divisionType` (defaults to `"Cumulative"` when omitted
 * or unset on the KPI — matches the schema default):
 *
 *   ┌──────────────┬────────────────────────────┬────────────────────────────┐
 *   │              │ Cumulative                 │ Standalone                 │
 *   ├──────────────┼────────────────────────────┼────────────────────────────┤
 *   │ qtdGoal      │ Σ weekly targets so far    │ = kpi.target (constant,    │
 *   │              │ (per-week map; falls back  │   when at least one prior  │
 *   │              │  to target/13 flat split)  │   week has target > 0)     │
 *   │ qtdAchieved  │ Σ values so far            │ Σ values so far /          │
 *   │              │                            │   count(weeks with target  │
 *   │              │                            │   > 0 in [1..currentWeek-1])│
 *   └──────────────┴────────────────────────────┴────────────────────────────┘
 *
 * Standalone matches the spec in `docs/individualKpi-standalone-logic.md`:
 * the denominator is `weeksWithTarget.length` (NOT the count of updated
 * weeks), so a week with a target but no entered value drags the average
 * down — the documented "penalty" semantics.
 *
 * When `currentWeek` is null (quarter not started / already ended / unknown)
 * we fall back to the server-stored `kpi.qtdGoal` / `qtdAchieved` to keep
 * historical/future KPIs rendering something sensible.
 *
 * Same algorithm StatsTab uses — extracted so the dashboard KPI table can
 * show the same numbers (was previously reading `kpi.qtdGoal` raw, which is
 * a stale aggregate that ignores the per-week breakdown).
 */
export function computeQtd(
  kpi: KPIRow,
  currentWeek: number | null,
  divisionType: "Cumulative" | "Standalone" = "Cumulative",
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): {
  qtdGoal: number | null;
  qtdAchieved: number | null;
} {
  if (currentWeek == null) {
    return {
      qtdGoal: kpi.target ?? kpi.qtdGoal ?? null,
      qtdAchieved: kpi.qtdAchieved ?? null,
    };
  }
  if (currentWeek <= 1) {
    return { qtdGoal: 0, qtdAchieved: 0 };
  }

  const priorWeeks = Array.from({ length: currentWeek - 1 }, (_, i) => i + 1);
  const wt = kpi.weeklyTargets ?? {};
  const totalTarget = kpi.target ?? kpi.qtdGoal ?? 0;
  const flat = totalTarget > 0 ? totalTarget / weeksPerQuarter : 0;

  // Resolve each prior week's target. Cumulative falls back to the flat
  // 1/13 split so missing weeks still contribute their share to the running
  // goal sum. Standalone treats a missing key as "no target configured" —
  // it must NOT receive the flat fallback, otherwise sparse `weeklyTargets`
  // maps (the shape the API returns — only weeks with an explicit target
  // are present) inflate `weeksWithTargetCount` and shrink the average,
  // showing 43% on the row instead of the correct 85%.
  const priorWeekTargets = priorWeeks.map((w) => {
    const v = wt[String(w)];
    if (typeof v === "number") return v;
    return divisionType === "Standalone" ? 0 : flat;
  });

  const wv = kpi.weeklyValues ?? [];
  const priorWeekValues = wv.filter((v) => v.weekNumber < currentWeek);
  const sumOfValues = priorWeekValues.reduce((sum, v) => sum + (v.value ?? 0), 0);

  if (divisionType === "Standalone") {
    // Standalone — every "valid" week (target > 0) counts equally toward
    // the denominator; the goal is the quarterly target (not a running sum).
    const weeksWithTargetCount = priorWeekTargets.filter((t) => t > 0).length;
    if (weeksWithTargetCount === 0) {
      return { qtdGoal: 0, qtdAchieved: 0 };
    }
    return {
      qtdGoal: totalTarget,
      qtdAchieved: sumOfValues / weeksWithTargetCount,
    };
  }

  // Cumulative — preserved exactly as before.
  const goal = priorWeekTargets.reduce((s, t) => s + t, 0);
  return { qtdGoal: goal, qtdAchieved: sumOfValues };
}

/**
 * QTD achieved/goal pair used for PROGRESS display — the dashboard KPI Overview
 * cards and the avg-KPI pill.
 *
 * Both divisions now derive their pair from the to-date `computeQtd()` so the
 * Overview cards show `achieved / QTD-Goal` (e.g. 54.24 / 75.25 — the cumulative
 * target through last week) — the SAME numbers the Stats panel prints. Reading
 * the quarterly `kpi.qtdGoal ?? kpi.target` (e.g. 100) made the card disagree
 * with the Stats panel and with the QTD Goal tile; dividing by the to-date goal
 * fixes that. Standalone is unchanged (it already used computeQtd → avg-per-week
 * against the constant quarterly target).
 *
 * When `currentWeek` is null (quarter not started / already ended / unknown),
 * `computeQtd` falls back to the quarterly target, keeping historical/future
 * KPIs rendering something sensible.
 */
export function resolveProgressQtd(
  kpi: KPIRow,
  currentWeek: number | null,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): { achieved: number; goal: number } {
  const divisionType: "Cumulative" | "Standalone" =
    kpi.divisionType === "Standalone" ? "Standalone" : "Cumulative";
  const { qtdAchieved, qtdGoal } = computeQtd(kpi, currentWeek, divisionType, weeksPerQuarter);
  return { achieved: qtdAchieved ?? 0, goal: qtdGoal ?? kpi.target ?? 0 };
}

/**
 * Progress percentage for a single KPI — the exact number the dashboard
 * KPI Overview card prints (`pct` in KPICard). Built on `resolveProgressQtd`
 * so Standalone KPIs use the re-derived per-week-average QTD instead of the
 * server's cumulative SUM. Returns 0 when the goal is non-positive.
 */
export function kpiProgressPercent(
  kpi: KPIRow,
  currentWeek: number | null,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): number {
  const { achieved, goal } = resolveProgressQtd(kpi, currentWeek, weeksPerQuarter);
  return goal > 0 ? (achieved / goal) * 100 : 0;
}

/**
 * Achieved / goal pair for OVERALL quarterly progress — achieved-to-date
 * measured against the FULL quarterly goal (NOT the to-date goal). This is the
 * "QTD Achieved / Quarterly Goal" view: e.g. 33.2K / 150K = 22%, as opposed to
 * `resolveProgressQtd` which divides by the to-date goal (33.2K / 125.2K = 27%,
 * a "pace vs where you should be by now" view).
 *
 * It mirrors EXACTLY the formula the Individual-KPI table's Progress column and
 * the Stats modal's "Overall Progress" headline already use, so the dashboard
 * KPI Overview cards agree with both:
 *   • Cumulative — achieved = server-stamped `kpi.qtdAchieved` (a cumulative
 *     SUM), goal = `kpi.qtdGoal ?? kpi.target` (the full quarterly goal).
 *   • Standalone — `kpi.qtdAchieved` is a SUM regardless of division type, so
 *     re-derive the per-week average via `computeQtd`; its `qtdGoal` is already
 *     the constant quarterly target. (Identical to `resolveProgressQtd` for
 *     Standalone — only Cumulative changes denominator.)
 */
export function resolveProgressOverall(
  kpi: KPIRow,
  currentWeek: number | null,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): { achieved: number; goal: number } {
  const divisionType: "Cumulative" | "Standalone" =
    kpi.divisionType === "Standalone" ? "Standalone" : "Cumulative";
  const std = divisionType === "Standalone" ? computeQtd(kpi, currentWeek, "Standalone", weeksPerQuarter) : null;
  const achieved = std != null ? (std.qtdAchieved ?? 0) : (kpi.qtdAchieved ?? 0);
  const goal = std != null ? (std.qtdGoal ?? kpi.target ?? 0) : (kpi.qtdGoal ?? kpi.target ?? 0);
  return { achieved, goal };
}

/**
 * Overall quarterly progress percentage (achieved-to-date ÷ full quarterly
 * goal). The number the dashboard KPI Overview card prints. Returns 0 when the
 * goal is non-positive.
 */
export function kpiOverallPercent(
  kpi: KPIRow,
  currentWeek: number | null,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): number {
  const { achieved, goal } = resolveProgressOverall(kpi, currentWeek, weeksPerQuarter);
  return goal > 0 ? (achieved / goal) * 100 : 0;
}

export interface KpiOverviewStats {
  /** Rounded mean of each ENTERED KPI's `kpiProgressPercent`. */
  avg: number;
  /** Card colored Blue (≥120%) or Green (≥100%). */
  onTrack: number;
  /** Card colored Yellow (80–99%). */
  atRisk: number;
  /** Card colored Red (<80%, value entered). */
  behind: number;
}

/**
 * Aggregate stats for the dashboard "avg KPI" pill (AvgKPICard).
 *
 * The on-track / at-risk / behind buckets are derived from the EXACT card color
 * each KPI shows — we run the canonical `getColorByPercentage` (the same helper
 * `KPICard`/`getProgressBadgeColors` use) on each card's `resolveProgressQtd`
 * pair, then bucket by color so the pill always matches what's on screen:
 *
 *   Blue (≥120%) | Green (≥100%) → onTrack
 *   Yellow (80–99%)              → atRisk
 *   Red (<80%, entered)          → behind
 *   Neutral (no value entered)   → excluded from all three counts
 *
 * Previously this used arbitrary 80/50 thresholds on the raw percentage, so the
 * counts disagreed with the cards (a 54% card is RED/below-target but was
 * counted "at risk"), `reverseColor` KPIs were scored backwards, and not-yet-
 * entered gray cards were lumped into "behind". `reverseColor` is now honored
 * and empty KPIs are excluded (so the three counts need not sum to the card
 * total).
 *
 * `avg` is the rounded mean of the per-card percentage over ENTERED KPIs only
 * (the gray 0/X cards are excluded so the average reflects tracked KPIs and
 * stays coherent with the buckets).
 */
export function computeKpiOverviewStats(
  kpis: KPIRow[],
  currentWeek: number | null,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): KpiOverviewStats {
  let onTrack = 0;
  let atRisk = 0;
  let behind = 0;
  let pctSum = 0;
  let entered = 0;

  for (const kpi of kpis) {
    const { achieved, goal } = resolveProgressQtd(kpi, currentWeek, weeksPerQuarter);
    const hasAnyWeeklyValue = (kpi.weeklyValues ?? []).some((wv) => wv.value != null);
    if (!hasAnyWeeklyValue) continue; // neutral/gray card — excluded
    entered += 1;
    pctSum += goal > 0 ? (achieved / goal) * 100 : 0;
    const { bg } = getColorByPercentage(achieved, goal, hasAnyWeeklyValue, kpi.reverseColor ?? false);
    if (bg === "bg-blue-600" || bg === "bg-green-600") onTrack += 1;
    else if (bg === "bg-yellow-500") atRisk += 1;
    else if (bg === "bg-red-600") behind += 1;
  }

  const avg = entered > 0 ? Math.round(pctSum / entered) : 0;
  return { avg, onTrack, atRisk, behind };
}

/**
 * Whether the dashboard "KPI Overview" card should be rendered.
 *
 * The section must stay mounted while EITHER the dashboard-summary query OR the
 * NextAuth session is still resolving. The overview's KPI list is filtered by
 * `owner === userId`, and `userId` is "" until the session lands — so a summary
 * query that resolves BEFORE the session would otherwise see an empty filtered
 * list and unmount the card, then remount once the session arrives. That race
 * is the "shows on refresh, then suddenly disappears (and comes back)" flicker.
 * Folding both loading sources into the gate keeps the card visible (showing
 * its skeleton) across the race, then transitions straight to the cards.
 *
 * `sessionStatus` is NextAuth's `useSession().status`
 * ("loading" | "authenticated" | "unauthenticated").
 */
export function kpiOverviewVisible(
  summaryLoading: boolean,
  sessionStatus: string,
  kpiCount: number,
): boolean {
  const loading = summaryLoading || sessionStatus === "loading";
  return loading || kpiCount > 0;
}

/**
 * Weekly Goal for a specific week. Uses the saved per-week target when set,
 * otherwise falls back to the flat 1/13 split of the quarterly target.
 */
export function weeklyGoalFor(
  kpi: KPIRow,
  weekNumber: number,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): number {
  return computeWeeklyGoal(kpi.weeklyTargets, kpi.target, kpi.qtdGoal, weekNumber, weeksPerQuarter);
}

/**
 * Aggregated stat bundle for the KPI EXPORT — the four numeric columns that were
 * previously dumped straight from the stored DB aggregates (`kpi.qtdGoal`,
 * `kpi.qtdAchieved`, `kpi.progressPercent`) and so disagreed with the KPI table
 * and the Stats drawer (both of which recompute from `weeklyTargets` /
 * `weeklyValues`). This reuses the SAME functions those surfaces use so the
 * exported sheet matches what's on screen:
 *
 *   - `qtdGoal` / `qtdAchieved` — `computeQtd(kpi, qtdWeek, …)` (Σ weekly goals /
 *     actuals through the reference week; Standalone → constant goal + avg).
 *   - `progressPercent`        — `kpiOverallPercent(kpi, qtdWeek, …)` (achieved-
 *     to-date ÷ full quarterly goal; identical to the table's Progress column).
 *   - `weeklyGoal`             — `weeklyGoalFor(kpi, currentWeek, …)` (the KPI
 *     table's Weekly Goal column: the current week's target or the flat split).
 *
 * `qtdWeek` is the QTD *reference* week (`qtdReferenceWeek`, past/current/future
 * aware); `currentWeek` is the display week (`getCurrentFiscalWeekFromStart`).
 * They differ only for a fully-past quarter — pass both so QTD and Weekly Goal
 * each use the week the on-screen UI uses.
 */
export function computeExportStats(
  kpi: KPIRow,
  currentWeek: number | null,
  qtdWeek: number | null,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): {
  qtdGoal: number | null;
  qtdAchieved: number | null;
  progressPercent: number;
  weeklyGoal: number;
} {
  const divisionType: "Cumulative" | "Standalone" =
    kpi.divisionType === "Standalone" ? "Standalone" : "Cumulative";
  const { qtdGoal, qtdAchieved } = computeQtd(kpi, qtdWeek, divisionType, weeksPerQuarter);
  const progressPercent = kpiOverallPercent(kpi, qtdWeek, weeksPerQuarter);
  const weeklyGoal = weeklyGoalFor(kpi, currentWeek ?? 1, weeksPerQuarter);
  return { qtdGoal, qtdAchieved, progressPercent, weeklyGoal };
}
