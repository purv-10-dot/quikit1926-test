import { getColorByPercentage, type ColorResult } from "./colorLogic";

/**
 * Format a number for display: strips floating-point noise, max 2 decimal places,
 * and removes trailing zeros. e.g. 97.521999 → "97.52", 4.0 → "4", 1.5 → "1.5"
 */
export function fmt(val: number | null | undefined, maxDecimals = 2): string {
  if (val === null || val === undefined) return "—";
  return parseFloat(val.toFixed(maxDecimals)).toString();
}

/**
 * Compact format for tight cells — abbreviates large numbers so they never overflow.
 * e.g. 127802.8 → "127.8K", 1234567 → "1.23M", 999 → "999", 97.52 → "97.52"
 * Full value is shown in the tooltip.
 */
export function fmtCompact(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (abs >= 1_000_000) return sign + parseFloat((abs / 1_000_000).toFixed(2)) + "M";
  if (abs >= 1_000)     return sign + parseFloat((abs / 1_000).toFixed(1)) + "K";
  return fmt(val);
}

/**
 * Maps overall KPI progress percentage to color using the new forward logic.
 * Thresholds: ≥120% blue, ≥100% green, ≥80% yellow, <80% red.
 */
export function progressColor(pct: number, reverse: boolean = false) {
  // Overall progress uses the new color logic with isUpdated=true
  // (if we're displaying a progress percent, the KPI has been tracked).
  const color = getColorByPercentage(pct, 100, true, reverse);

  // Map ColorResult to legacy bar/text/label shape for backward compat.
  if (color.bg === "bg-blue-600") return { bar: "bg-blue-600", text: "text-blue-700", label: reverse ? "Much Better" : "Exceeded" };
  if (color.bg === "bg-green-600") return { bar: "bg-green-600", text: "text-green-700", label: reverse ? "On Track" : "Achieved" };
  if (color.bg === "bg-yellow-500") return { bar: "bg-yellow-500", text: "text-yellow-600", label: reverse ? "Slightly Worse" : "Near Target" };
  if (color.bg === "bg-red-600") return { bar: "bg-red-600", text: "text-red-700", label: reverse ? "Poor" : "Below Target" };
  return { bar: "bg-gray-300", text: "text-gray-500", label: "—" };
}

/**
 * Returns bg + text classes for a KPI week cell.
 *
 * Weekly target is always derived from qtdGoal (fallback to target) divided by 13.
 *
 * @param val The weekly value entered by the user
 * @param qtdGoal The quarter-to-date goal (the primary target)
 * @param fallbackTarget Legacy `target` field as fallback
 * @param reverse True for reverse KPIs (lower is better)
 */
export function weekCellColors(
  val: number | null | undefined,
  qtdGoal: number | null | undefined,
  fallbackTarget: number | null | undefined = null,
  reverse: boolean = false,
): { bg: string; text: string; label: string } {
  const weeklyTarget = ((qtdGoal ?? fallbackTarget ?? 0)) / 13;
  const isUpdated = val !== null && val !== undefined;
  const numVal = isUpdated ? val : 0;
  const color: ColorResult = getColorByPercentage(numVal, weeklyTarget, isUpdated, reverse);
  // Derive accessible label from color
  let label = "No data";
  if (isUpdated) {
    if (color.bg === "bg-blue-600") label = "Exceeded";
    else if (color.bg === "bg-green-600") label = "Achieved";
    else if (color.bg === "bg-yellow-500") label = "Near target";
    else if (color.bg === "bg-red-600") label = "Below target";
    else label = "Neutral";
  }
  return { bg: color.bg, text: color.text, label };
}
