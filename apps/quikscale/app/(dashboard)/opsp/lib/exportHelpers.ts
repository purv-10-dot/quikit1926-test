/**
 * Pure helpers for the OPSP "Export to KPI / Export to Priority" flow.
 *
 * The Accountability section's free-text rows are turned into stepper steps
 * (one per filled row) and prefilled KPI/Priority payloads. Kept pure (no React,
 * no DB) so they're unit-testable in isolation.
 */

import { buildBreakdown } from "../../kpi/components/kpiModalHelpers";
import type { KPIAcctRow, QPriorRow } from "../types";

/**
 * Parse a free-text "Goal" value (e.g. "$50K", "1,200", "8", "2.5M") into a
 * number for the KPI Target field. Strips currency symbols and thousands
 * separators; honours a trailing K/M magnitude suffix. Returns 0 when nothing
 * numeric is present (the user can then type a target in the stepper).
 */
export function parseGoalToNumber(goal: string | null | undefined): number {
  if (!goal) return 0;
  const cleaned = goal.replace(/,/g, "");
  const m = cleaned.match(/(-?\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  if (m[2]) n *= m[2].toLowerCase() === "k" ? 1_000 : 1_000_000;
  return n;
}

/** Accountability KPI rows that carry a name — the rows we export as KPIs. */
export function filledKpiRows(rows: KPIAcctRow[]): KPIAcctRow[] {
  return (rows ?? []).filter((r) => (r?.kpi ?? "").trim().length > 0);
}

/** Quarterly-priority rows that carry a name — the rows we export as Priorities. */
export function filledPriorityRows(rows: QPriorRow[]): QPriorRow[] {
  return (rows ?? []).filter((r) => (r?.priority ?? "").trim().length > 0);
}

/* ── Re-export categorization (Previously Exported vs New) ───────────────── */

/** Minimal shape of an existing KPI/Priority needed to detect a prior export. */
export interface ExistingExportItem {
  id: string;
  name: string;
  /** KPI target (Priorities have none). */
  target?: number | null;
  importedFromOpsp?: boolean;
  /** Extra fields surfaced read-only in the "Previously Exported" tab. */
  measurementUnit?: string | null;
  divisionType?: string | null;
  frequency?: string | null;
  ownerName?: string | null;
  startWeek?: number | null;
  endWeek?: number | null;
}

const normName = (s: string) => s.trim().toLowerCase();
const numEq = (a?: number | null, b?: number | null) => {
  const x = a ?? null;
  const y = b ?? null;
  if (x === null && y === null) return true;
  if (x === null || y === null) return false;
  return Math.abs(x - y) < 1e-9;
};

export interface KpiRowCategory {
  row: KPIAcctRow;
  target: number;
  /** The matched existing KPI when this row was already exported, else null. */
  existing: ExistingExportItem | null;
}

/**
 * Split filled Accountability rows into already-exported vs new, by matching
 * each row against existing KPIs. A row is "previously exported" when an
 * existing KPI has the same name AND either was imported from OPSP
 * (`importedFromOpsp`) OR has the same target — the "flag + name" rule with a
 * name+target fallback for KPIs created before the flag existed. Pure.
 */
export function categorizeKpiRows(
  rows: KPIAcctRow[],
  existing: ExistingExportItem[],
): { alreadyExported: KpiRowCategory[]; newRows: KpiRowCategory[] } {
  const alreadyExported: KpiRowCategory[] = [];
  const newRows: KpiRowCategory[] = [];
  for (const row of filledKpiRows(rows)) {
    const target = parseGoalToNumber(row.goal);
    const match =
      existing.find(
        (k) =>
          normName(k.name) === normName(row.kpi) &&
          (k.importedFromOpsp === true || numEq(k.target, target)),
      ) ?? null;
    (match ? alreadyExported : newRows).push({ row, target, existing: match });
  }
  return { alreadyExported, newRows };
}

/* ── Replace: carry-forward eligibility ─────────────────────────────────── */

/**
 * Whether the previous data (weekly actuals, achieved, progress, notes) may be
 * CARRIED FORWARD when a KPI is replaced via OPSP export.
 *
 * Only when the new KPI's target equals the existing KPI's target — a different
 * target makes the old weekly actuals meaningless against the new goal, so the
 * UI forces a reset in that case. Mirrors the product rule: "Retain is
 * available only when the target values of the old and new KPI match."
 */
export function canCarryForwardKPI(newTarget: number, existingTarget?: number | null): boolean {
  return numEq(newTarget, existingTarget ?? null);
}

/**
 * Whether previous weekly statuses + notes may be carried forward when a
 * Priority is replaced. Priorities have no numeric target, so eligibility is
 * gated on the start/end week RANGE matching (the Priority analog of "same
 * target") — a different window means the weekly statuses no longer line up.
 */
export function canCarryForwardPriority(
  newStartWeek: number,
  newEndWeek: number,
  existingStartWeek?: number | null,
  existingEndWeek?: number | null,
): boolean {
  return (
    numEq(newStartWeek, existingStartWeek ?? null) &&
    numEq(newEndWeek, existingEndWeek ?? null)
  );
}

export interface PriorityRowCategory {
  row: QPriorRow;
  existing: ExistingExportItem | null;
}

/**
 * Split filled Quarterly-Priority rows into already-exported vs new. Priorities
 * have no target, so the match is by name within the owner+quarter+year set
 * fetched by the caller (flagged rows are still matched first). Pure.
 */
export function categorizePriorityRows(
  rows: QPriorRow[],
  existing: ExistingExportItem[],
): { alreadyExported: PriorityRowCategory[]; newRows: PriorityRowCategory[] } {
  const alreadyExported: PriorityRowCategory[] = [];
  const newRows: PriorityRowCategory[] = [];
  for (const row of filledPriorityRows(rows)) {
    const byName = existing.filter((p) => normName(p.name) === normName(row.priority));
    const match = byName.find((p) => p.importedFromOpsp === true) ?? byName[0] ?? null;
    (match ? alreadyExported : newRows).push({ row, existing: match });
  }
  return { alreadyExported, newRows };
}

/**
 * Whether a weekly Target-Breakdown cell is blocked (read-only, value 0).
 * Past weeks (before the current fiscal week) are blocked UNLESS the org's
 * "Add Past Week Data" flag is enabled — then they stay editable. Mirrors the
 * Add-New-KPI modal's past-cell rule (`w < currentWeek && !pastWeekAllowed`).
 */
export function isWeekBlocked(
  week: number,
  firstEditableWeek: number,
  pastWeekAllowed: boolean,
): boolean {
  return week < firstEditableWeek && !pastWeekAllowed;
}

/** Minimal shape of a KPI export step the weekly rebuild needs. */
interface WeeklyStepLike {
  target: string;
  measurementUnit: "Number" | "Percentage" | "Currency";
  divisionType: "Cumulative" | "Standalone";
  weekly: Record<number, string>;
}

/**
 * Recompute each step's weekly Target Breakdown once the current fiscal week
 * resolves (it loads async, so the initial seed is built at firstEditableWeek=1
 * and spreads across all 13 weeks). Mirrors the KPI modal's
 * "firstEditableWeek resolved" recalculation.
 *
 * Steps the user has already hand-edited (`isEdited(i)`) and steps with no
 * positive target are returned untouched so we never clobber overrides.
 */
export function rebuildStepWeekly<T extends WeeklyStepLike>(
  forms: T[],
  firstEditableWeek: number,
  isEdited: (i: number) => boolean,
): T[] {
  return forms.map((f, i) => {
    if (isEdited(i)) return f;
    const target = parseFloat(f.target) || 0;
    if (target <= 0) return f;
    return {
      ...f,
      weekly: buildBreakdown(f.divisionType, target, f.measurementUnit, firstEditableWeek),
    };
  });
}
