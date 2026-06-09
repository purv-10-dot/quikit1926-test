/**
 * OPSP year/quarter picker gating — pure, framework-free predicates.
 *
 * Extracted from the inline logic in `app/(dashboard)/opsp/page.tsx` so the
 * "which periods can the user open?" rules are unit-testable and shared by the
 * year list AND the quarter grid (they used to diverge: the quarter grid
 * honored the finalize chain across the FY boundary, but the year list was
 * hard-locked to the current fiscal year — so a finalized Q4 could never open
 * the next FY's Q1).
 *
 * `reviewedQuarters` is the list of `"{year}:{quarter}"` keys whose OPSP is
 * finalized/reviewed (see GET /api/opsp/config). A quarter unlocks once the
 * immediately prior quarter — the prior FY's Q4 for a Q1 — is in that list.
 */

export interface QuarterSelectableArgs {
  year: number;
  /** 1–4. */
  qNum: number;
  /** Earliest year that has an OPSP record (plan start). Null before setup. */
  planStartYear: number | null;
  /** e.g. "Q2" when the org onboarded mid-year. Null before setup. */
  planStartQuarter: string | null;
  /** "{year}:{quarter}" keys that are finalized/reviewed. */
  reviewedQuarters: string[];
}

/**
 * Is a single (year, quarter) cell selectable in the picker?
 *
 * Mirrors exactly the prior inline rule `!(isBeforeStart || isLocked)`:
 *   - before the plan's first quarter in the start year → not selectable
 *   - the plan's very first quarter → always selectable
 *   - otherwise the immediately prior quarter must be finalized/reviewed
 *     (prev-year Q4 for a Q1, so the chain spans the FY boundary)
 */
export function isQuarterSelectable({
  year,
  qNum,
  planStartYear,
  planStartQuarter,
  reviewedQuarters,
}: QuarterSelectableArgs): boolean {
  const startQNum = planStartQuarter
    ? parseInt(planStartQuarter.replace("Q", ""), 10)
    : 1;

  const isBeforeStart = year === planStartYear && qNum < startQNum;
  if (isBeforeStart) return false;

  const isPlanFirst = year === planStartYear && qNum === startQNum;
  if (isPlanFirst) return true;

  const prevYear = qNum === 1 ? year - 1 : year;
  const prevQ = qNum === 1 ? "Q4" : `Q${qNum - 1}`;
  return reviewedQuarters.includes(`${prevYear}:${prevQ}`);
}

export interface YearSelectableArgs {
  year: number;
  /** The fiscal year that contains today's date. Always selectable. */
  currentFiscalYear: number;
  planStartYear: number | null;
  planStartQuarter: string | null;
  reviewedQuarters: string[];
}

/**
 * Is a fiscal year selectable in the picker?
 *
 * Additive over the old `year === currentFiscalYear` rule: the current FY stays
 * always-open, AND any year reachable via the finalize chain (i.e. at least one
 * of its quarters is selectable) is opened too. This is what lets finalizing
 * year N's Q4 open year N+1 (its Q1 unlocks). Progression stays one step at a
 * time — N+2 stays closed until N+1's Q4 is finalized.
 */
export function isYearSelectable({
  year,
  currentFiscalYear,
  planStartYear,
  planStartQuarter,
  reviewedQuarters,
}: YearSelectableArgs): boolean {
  if (year === currentFiscalYear) return true;
  return [1, 2, 3, 4].some((qNum) =>
    isQuarterSelectable({ year, qNum, planStartYear, planStartQuarter, reviewedQuarters }),
  );
}
