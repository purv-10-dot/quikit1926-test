/**
 * kpiFormulaTooltips — the ONE source of the "how was this number calculated?"
 * explanations shown on hover across every KPI surface:
 *
 *   - the dashboard "avg KPI" pill                     → `explainAvgKpi`
 *   - the dashboard KPI Overview card (headline/QTR/QTD) → `explainOverall`,
 *     `explainQtr`, `explainQtd`
 *   - the "Progress (Quarterly Goal)" column on the Individual + Team KPI grids
 *     → `explainQtr`
 *   - the Team KPI section-header average               → `explainTeamAvg`
 *   - every tile in the Stats drawer                    → `explain*` tiles below
 *
 * DESIGN RULE — every builder computes its substitution numbers by calling the
 * SAME helper in `kpiStats.ts` that produces the number on screen
 * (`resolvePace`, `computeQtd`, `computeKPIStats`, `computeKpiOverviewStats`).
 * Nothing here re-implements the math, so a tooltip cannot drift from the value
 * it explains. If a formula changes, it changes in `kpiStats.ts` and the wording
 * here follows in one place.
 *
 * Pure module — no React, no DOM, so the strings are unit-testable. The
 * presentation lives in `FormulaTooltip.tsx`.
 */

import type { KPIRow } from "@/lib/types/kpi";
import { DEFAULT_WEEKS_PER_QUARTER } from "@/lib/utils/fiscal";
import {
  computeKPIStats,
  computeQtd,
  resolvePace,
  resolveProgressOverall,
  resolveProgressQtd,
  weeklyGoalTile,
  kpiQtrPercent,
  type KpiOverviewStats,
} from "./kpiStats";

/**
 * A rendered explanation. `formula` is the symbolic rule, `substitution` the
 * same rule with this KPI's live numbers, `result` the displayed figure.
 * `substitution` / `result` are omitted when there is nothing meaningful to
 * substitute (e.g. no target configured).
 */
export interface FormulaExplain {
  /** Short heading, e.g. "Quarterly Progress". */
  title: string;
  /** Symbolic formula, e.g. "QTD Achieved ÷ Quarterly Goal × 100". */
  formula: string;
  /** Same formula with live numbers, e.g. "162 ÷ 800 × 100". */
  substitution?: string;
  /** The figure on screen, e.g. "20%". */
  result?: string;
  /** Caveat / scope note rendered in muted text. */
  note?: string;
}

export type DivisionType = "Cumulative" | "Standalone";

/** Division type with the schema default applied (unset → Cumulative). */
export function divisionOf(kpi: KPIRow): DivisionType {
  return kpi.divisionType === "Standalone" ? "Standalone" : "Cumulative";
}

/**
 * Number formatter for tooltip bodies. Trims float noise (2 decimals max) and
 * groups thousands so long sums stay readable. Kept local — the KPI display
 * formatters (`formatScaledKpiValue`) apply currency scaling, which would make
 * the substitution stop matching the arithmetic being explained.
 */
export function fmtNum(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return parseFloat(v.toFixed(2)).toLocaleString("en-US");
}

/** Percentage formatter — matches the 0-decimal display on every surface. */
export function fmtPct(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(0)}%`;
}

// ── Dashboard: avg KPI pill ──────────────────────────────────────────────────

/**
 * "avg KPI" pill on the dashboard KPI Overview header.
 *
 * A single WEIGHTED ratio across every entered KPI — not the mean of each
 * card's percentage — so a large-goal KPI moves the pill more than a small one
 * (see `computeKpiOverviewStats` and docs/kpi-avg-calc-examples.md).
 */
export function explainAvgKpi(stats: KpiOverviewStats): FormulaExplain {
  const { avg, achievedSum, goalSum, entered, notStarted } = stats;
  const counted = `${entered} KPI${entered === 1 ? "" : "s"} counted`;
  const idle = notStarted > 0 ? `; ${notStarted} idle (no week logged) excluded` : "";
  return {
    title: "Average KPI %",
    formula: "(Σ QTD Achieved ÷ Σ QTD Goal) × 100",
    substitution:
      goalSum > 0 ? `(${fmtNum(achievedSum)} ÷ ${fmtNum(goalSum)}) × 100` : undefined,
    result: goalSum > 0 ? `${avg}%` : undefined,
    note: `Totals across all KPIs, not an average of each KPI's own % — ${counted}${idle}.`,
  };
}

// ── Quarterly Progress (QTR) ─────────────────────────────────────────────────

/**
 * "Quarterly Progress" — achieved-to-date ÷ the full quarter's potential.
 *
 * The definition differs by division type because the two define their target
 * differently (see `resolvePace`):
 *
 *   Cumulative — weekly targets accrue to the quarterly goal, so the potential
 *     IS the Quarterly Goal.
 *   Standalone — the target is the same flat number EVERY week and never
 *     accrues, so the potential is `Target Value × Weeks in Quarter`.
 *
 * This is the number rendered by the grids' "Progress (Quarterly Goal)" column,
 * the dashboard card's QTR bar, the Stats drawer headline and both exports.
 */
export function explainQtr(
  kpi: KPIRow,
  currentWeek: number | null,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): FormulaExplain {
  const division = divisionOf(kpi);
  const { achieved, goal } = resolvePace(kpi, currentWeek, weeksPerQuarter);
  const pct = kpiQtrPercent(kpi, currentWeek, weeksPerQuarter);

  if (division === "Standalone") {
    const target = kpi.target ?? kpi.qtdGoal ?? 0;
    return {
      title: "Quarterly Progress (Standalone)",
      formula: "Achieved to Date ÷ (Target Value × Weeks in Quarter) × 100",
      substitution:
        goal > 0
          ? `${fmtNum(achieved)} ÷ (${fmtNum(target)} × ${weeksPerQuarter}) × 100`
          : undefined,
      result: goal > 0 ? fmtPct(pct) : undefined,
      note:
        "Standalone targets repeat every week instead of adding up, so the whole quarter's potential is Target × Weeks. Achieved counts completed weeks only (the current week is still in progress).",
    };
  }

  return {
    title: "Quarterly Progress (Cumulative)",
    formula: "QTD Achieved ÷ Quarterly Goal × 100",
    substitution: goal > 0 ? `${fmtNum(achieved)} ÷ ${fmtNum(goal)} × 100` : undefined,
    result: goal > 0 ? fmtPct(pct) : undefined,
    note: "QTD Achieved sums completed weeks only — the current week is still in progress.",
  };
}

/**
 * The dashboard card's HEADLINE figure (`achieved / goal (pct%)`).
 * For Cumulative this is the same pair as `explainQtr` by construction; for
 * Standalone it is the per-week average against the (per-week) quarterly
 * target, which is deliberately a different view from the QTR bar.
 */
export function explainOverall(
  kpi: KPIRow,
  currentWeek: number | null,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): FormulaExplain {
  const { achieved, goal } = resolveProgressOverall(kpi, currentWeek, weeksPerQuarter);
  const pct = goal > 0 ? (achieved / goal) * 100 : 0;
  return {
    title: "Overall Progress",
    formula: "QTD Achieved ÷ Quarterly Goal × 100",
    substitution: goal > 0 ? `${fmtNum(achieved)} ÷ ${fmtNum(goal)} × 100` : undefined,
    result: goal > 0 ? fmtPct(pct) : undefined,
    note: "Achieved to date measured against the full quarter's goal.",
  };
}

// ── Quarter Till Date (QTD) ──────────────────────────────────────────────────

/**
 * "Quarter Till Date" — actual performance against where the KPI should be
 * RIGHT NOW (the goal due so far), rather than against the whole quarter.
 * Answers "am I ahead or behind schedule", where QTR answers "how much of the
 * quarter is banked".
 */
export function explainQtd(
  kpi: KPIRow,
  currentWeek: number | null,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): FormulaExplain {
  const division = divisionOf(kpi);
  const { achieved, goal } = resolveProgressQtd(kpi, currentWeek, weeksPerQuarter);
  const pct = goal > 0 ? (achieved / goal) * 100 : 0;
  const substitution = goal > 0 ? `${fmtNum(achieved)} ÷ ${fmtNum(goal)} × 100` : undefined;
  const result = goal > 0 ? fmtPct(pct) : undefined;

  if (division === "Standalone") {
    return {
      title: "Quarter Till Date (Standalone)",
      formula: "QTD Achieved ÷ QTD Goal × 100",
      substitution,
      result,
      note: "Standalone: QTD Achieved is the average per week (Σ values ÷ weeks that have a target), and QTD Goal stays the constant Target Value.",
    };
  }

  return {
    title: "Quarter Till Date (Cumulative)",
    formula: "QTD Achieved ÷ QTD Goal × 100",
    substitution,
    result,
    note: "QTD Goal is the sum of the weekly goals due through last week — so this reads as ahead of / behind schedule.",
  };
}

// ── Team KPI section header ──────────────────────────────────────────────────

/**
 * Team section header average. Unlike the dashboard pill this is a PLAIN MEAN
 * of each row's Quarterly Progress (every KPI weighted equally), because it
 * summarises the visible rows rather than the team's total output — see
 * `TeamSection`'s `summary` memo.
 */
export function explainTeamAvg(count: number, avgProgress: number): FormulaExplain {
  return {
    title: "Team Average Progress",
    formula: "Σ each KPI's Quarterly Progress ÷ Number of KPIs",
    substitution: count > 0 ? `Σ of ${count} KPI ${count === 1 ? "%" : "%s"} ÷ ${count}` : undefined,
    result: count > 0 ? `${avgProgress}%` : undefined,
    note: "Each KPI counts equally here (a plain average of the % in the rows below).",
  };
}

// ── Stats drawer tiles ───────────────────────────────────────────────────────

export function explainWeeksReported(
  kpi: KPIRow,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): FormulaExplain {
  const { filledWeeks } = computeKPIStats(kpi, weeksPerQuarter);
  return {
    title: "Weeks Reported",
    formula: "Count of weeks with a value entered",
    substitution: filledWeeks.length > 0 ? `Weeks ${filledWeeks.join(", ")}` : undefined,
    result: `${filledWeeks.length} of ${weeksPerQuarter}`,
    note: "A week with a target but no entered value is not counted.",
  };
}

export function explainAvgPerWeek(
  kpi: KPIRow,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): FormulaExplain {
  const { filledWeeks, avgPerWeek } = computeKPIStats(kpi, weeksPerQuarter);
  return {
    title: "Average per Week",
    formula: "Σ Weekly Values ÷ Weeks Reported",
    substitution:
      filledWeeks.length > 0
        ? `${fmtNum(avgPerWeek * filledWeeks.length)} ÷ ${filledWeeks.length}`
        : undefined,
    result: filledWeeks.length > 0 ? fmtNum(avgPerWeek) : undefined,
    note: "Averaged over reported weeks only, so blank weeks do not drag it down.",
  };
}

export function explainBestWeek(
  kpi: KPIRow,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): FormulaExplain {
  const { bestWeek, bestValue } = computeKPIStats(kpi, weeksPerQuarter);
  return {
    title: "Best Week",
    formula: "The reported week with the highest value",
    substitution: bestWeek > 0 ? `max of all reported weeks` : undefined,
    result: bestWeek > 0 ? `Week ${bestWeek} · ${fmtNum(bestValue)}` : undefined,
    note: "Highest raw value — it is not compared against that week's target.",
  };
}

export function explainQuarterlyGoal(kpi: KPIRow): FormulaExplain {
  const division = divisionOf(kpi);
  const goal = kpi.quarterlyGoal ?? kpi.target ?? kpi.qtdGoal ?? 0;
  return {
    title: "Quarterly Goal",
    formula: "The target set for this KPI this quarter",
    result: fmtNum(goal),
    note:
      division === "Standalone"
        ? "Standalone: this is the target for EACH week — it repeats weekly rather than adding up."
        : "Cumulative: the weekly goals add up to this quarterly total.",
  };
}

export function explainQtdGoal(
  kpi: KPIRow,
  qtdWeek: number | null,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): FormulaExplain {
  const division = divisionOf(kpi);
  const { qtdGoal } = computeQtd(kpi, qtdWeek, division, weeksPerQuarter);
  const lastWeek = qtdWeek != null && qtdWeek > 1 ? qtdWeek - 1 : null;
  return {
    title: "QTD Goal",
    formula:
      division === "Standalone"
        ? "Target Value (constant every week)"
        : "Σ Weekly Goals for completed weeks",
    substitution:
      division === "Cumulative" && lastWeek != null ? `Weeks 1 – ${lastWeek}` : undefined,
    result: qtdGoal != null ? fmtNum(qtdGoal) : undefined,
    note: "Completed weeks only — the current week is still in progress.",
  };
}

export function explainQtdAchieved(
  kpi: KPIRow,
  qtdWeek: number | null,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): FormulaExplain {
  const division = divisionOf(kpi);
  const { qtdGoal, qtdAchieved } = computeQtd(kpi, qtdWeek, division, weeksPerQuarter);
  const lastWeek = qtdWeek != null && qtdWeek > 1 ? qtdWeek - 1 : null;
  return {
    title: "QTD Achieved",
    formula:
      division === "Standalone"
        ? "Σ Weekly Values ÷ Weeks that have a Target"
        : "Σ Weekly Values for completed weeks",
    substitution: lastWeek != null ? `Weeks 1 – ${lastWeek}` : undefined,
    result:
      qtdGoal != null
        ? `${fmtNum(qtdAchieved ?? 0)} of ${fmtNum(qtdGoal)}`
        : fmtNum(qtdAchieved ?? 0),
    note:
      division === "Standalone"
        ? "Standalone divides by every week that has a target, so a target week left blank pulls the average down."
        : "Completed weeks only — the current week is still in progress.",
  };
}

export function explainWeeklyGoal(
  kpi: KPIRow,
  qtdWeek: number | null,
  weeksPerQuarter: number = DEFAULT_WEEKS_PER_QUARTER,
): FormulaExplain {
  const tile = weeklyGoalTile(kpi, qtdWeek, weeksPerQuarter);
  return {
    title: "Weekly Goal",
    formula: "Last completed week's Value ÷ that week's Goal",
    substitution: tile != null ? `Week ${tile.week}` : undefined,
    result:
      tile != null
        ? `${tile.value != null ? fmtNum(tile.value) : "—"} of ${fmtNum(tile.target)}`
        : undefined,
    note: "The per-week goal is the saved target for that week, or the quarterly goal split evenly across the quarter's weeks when none is set.",
  };
}
