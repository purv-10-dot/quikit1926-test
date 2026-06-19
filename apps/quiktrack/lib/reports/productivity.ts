/**
 * Productivity calculation engine.
 *
 * Composite 0-100 score blended from signals we actually have in the schema:
 *   - completion rate (closed / created)
 *   - on-time rate    (closed before due / total closed-with-dueDate)
 *   - slip rate       (open-past-due / created)
 *   - hours variance  (1 - clamped overage on actual vs estimated)
 *
 * The formula is intentionally pure: callers pass plain numbers, the function
 * returns a number. Same inputs always produce the same score so it's safe to
 * unit-test and to call from both the API route and the heatmap aggregator.
 *
 * Weights chosen to keep "closing what you start" the dominant signal, with
 * on-time delivery and slip-rate as guard rails. Hours variance is a soft
 * penalty: bad estimates shouldn't drown out a team that's still delivering.
 */

export interface ProductivityInputs {
  /** Tasks created in the period. */
  created: number;
  /** Tasks moved to a DONE category in the period. */
  closed: number;
  /** Tasks whose dueDate was in the period and were still open at period end. */
  slipped: number;
  /**
   * Of `closed`, the count that closed on or before their dueDate.
   * If we can't compute it (no dueDate set), pass null — the on-time term
   * collapses to a neutral 1.0 instead of dragging the score down.
   */
  closedOnTime?: number | null;
  /** Estimated hours summed across tasks in the period. */
  estHours: number;
  /** Logged hours summed from timesheet entries in the period. */
  actualHours: number;
}

export const PRODUCTIVITY_WEIGHTS = {
  completion: 0.45,
  onTime: 0.25,
  slip: 0.2,
  hours: 0.1,
} as const;

/**
 * Returns a productivity score 0-100 (integer). Returns 0 when nothing
 * happened so empty cells render as a clear "no signal" rather than NaN.
 */
export function calculateProductivity(input: ProductivityInputs): number {
  if (input.created === 0 && input.closed === 0 && input.slipped === 0) return 0;

  const completion = safeRatio(input.closed, input.created);
  const slipPenalty = 1 - safeRatio(input.slipped, Math.max(input.created, 1));
  const onTime =
    input.closedOnTime === null || input.closedOnTime === undefined || input.closed === 0
      ? 1
      : clamp01(input.closedOnTime / input.closed);
  const hoursTerm = hoursVarianceTerm(input.estHours, input.actualHours);

  const raw =
    PRODUCTIVITY_WEIGHTS.completion * clamp01(completion) +
    PRODUCTIVITY_WEIGHTS.onTime * clamp01(onTime) +
    PRODUCTIVITY_WEIGHTS.slip * clamp01(slipPenalty) +
    PRODUCTIVITY_WEIGHTS.hours * hoursTerm;

  return Math.round(clamp01(raw) * 100);
}

/**
 * Penalize hours overrun. 0% overage → 1.0, 50% over → 0.5, 100%+ over → 0.
 * Under-estimating (logged < est) isn't penalized — that's a planning win.
 */
function hoursVarianceTerm(est: number, actual: number): number {
  if (est <= 0) return 1;
  if (actual <= est) return 1;
  const overagePct = (actual - est) / est;
  return clamp01(1 - overagePct);
}

function safeRatio(num: number, den: number): number {
  if (den <= 0) return 0;
  return num / den;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Used by KPI cards: average velocity = closed tasks per week.
 * Returns 0 (not NaN) when the period is empty.
 */
export function averageVelocity(closedSeries: number[]): number {
  if (closedSeries.length === 0) return 0;
  const total = closedSeries.reduce((a, b) => a + b, 0);
  return Math.round((total / closedSeries.length) * 10) / 10;
}

/**
 * Delayed task share: slipped / created.
 */
export function delayedRate(created: number, slipped: number): number {
  if (created <= 0) return 0;
  return Math.round((slipped / created) * 100);
}

/**
 * Tone band used by the team productivity heatmap and the Top Employees row.
 * Hardcoded thresholds — these are semantic "good/ok/bad" buckets and
 * intentionally don't theme.
 */
export type ProductivityTone = "high" | "medium" | "low";

export function productivityTone(score: number): ProductivityTone {
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  return "low";
}
