/**
 * Color coding logic for KPI values.
 *
 * Two modes:
 * - Forward (default): Higher values are better (sales, revenue, customers)
 *   - ≥120%: BLUE  (target exceeded significantly)
 *   - ≥100%: GREEN (target achieved)
 *   - ≥80%:  YELLOW (near target)
 *   - <80% + updated: RED (below target)
 *
 * - Reverse: Lower values are better (defects, delays, errors, complaints)
 *   - ≤80%: BLUE  (significantly better than target)
 *   - ≤100%: GREEN (within target)
 *   - ≤120%: YELLOW (slightly worse)
 *   - >120% + updated: RED (poor performance)
 *
 * In both modes, `isUpdated` distinguishes "no value entered yet"
 * (→ NEUTRAL) from "value entered but below threshold" (→ RED).
 */

export interface ColorResult {
  bg: string;
  text: string;
  className: string;
}

const BLUE: ColorResult = {
  bg: "bg-blue-600",
  text: "text-white",
  className: "bg-blue-600 text-white font-bold",
};
const GREEN: ColorResult = {
  bg: "bg-green-600",
  text: "text-white",
  className: "bg-green-600 text-white font-bold",
};
const YELLOW: ColorResult = {
  bg: "bg-yellow-500",
  text: "text-white",
  className: "bg-yellow-500 text-white font-bold",
};
const RED: ColorResult = {
  bg: "bg-red-600",
  text: "text-white",
  className: "bg-red-600 text-white font-bold",
};
const NEUTRAL: ColorResult = {
  bg: "",
  text: "text-gray-300",
  className: "text-gray-300",
};

/**
 * Forward color logic (higher is better).
 */
export function resolveColorByPercentage(
  percentage: number,
  target: number,
  value: number,
  isUpdated: boolean,
): ColorResult {
  if (percentage >= 120 || (target <= 0 && value > 0)) return BLUE;
  if (percentage >= 100) return GREEN;
  if (percentage >= 80) return YELLOW;
  if (isUpdated && percentage < 80) return RED;
  return NEUTRAL;
}

/**
 * Reverse color logic (lower is better).
 *
 * Unlike the forward resolver (whose thresholds are lower-bounds and therefore
 * unreachable when value=0), the reverse resolver's thresholds are upper-bounds —
 * an unentered cell with value=0 would spuriously satisfy `pct <= 80` and render
 * BLUE. So we must short-circuit on `!isUpdated` before evaluating thresholds.
 *
 * Zero-tolerance target (e.g. "zero defects this week"): any positive value is a
 * failure; only value=0 meets the target. We branch explicitly to avoid the
 * division-protected percentage=0 leaking into the BLUE branch.
 */
export function resolveReversedColorByPercentage(
  percentage: number,
  target: number,
  value: number,
  isUpdated: boolean,
): ColorResult {
  if (!isUpdated) return NEUTRAL;
  if (target <= 0) return value === 0 ? BLUE : RED;
  if (percentage <= 80) return BLUE;
  if (percentage <= 100) return GREEN;
  if (percentage <= 120) return YELLOW;
  return RED;
}

/**
 * Unified entry point. Computes percentage and delegates to the appropriate resolver.
 *
 * @param value The actual value entered by the user
 * @param target The target value to compare against
 * @param isUpdated Whether the user has entered a value (false = neutral)
 * @param reverse True for reverse logic (lower is better)
 */
export function getColorByPercentage(
  value: number,
  target: number,
  isUpdated: boolean,
  reverse: boolean = false,
): ColorResult {
  const percentage = target > 0 ? (value / target) * 100 : 0;
  return reverse
    ? resolveReversedColorByPercentage(percentage, target, value, isUpdated)
    : resolveColorByPercentage(percentage, target, value, isUpdated);
}
