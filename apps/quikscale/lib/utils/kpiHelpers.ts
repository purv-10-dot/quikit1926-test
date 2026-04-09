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

/** Maps progress percentage to color classes for bar + text + label. */
export function progressColor(pct: number) {
  if (pct >= 100) return { bar: "bg-blue-500", text: "text-blue-600", label: "On Track" };
  if (pct >= 80)  return { bar: "bg-green-500", text: "text-green-600", label: "Good" };
  if (pct >= 50)  return { bar: "bg-yellow-400", text: "text-yellow-600", label: "Behind" };
  return { bar: "bg-red-500", text: "text-red-600", label: "Critical" };
}

/** Returns bg + text classes to fill a week cell with color based on value vs target. */
export function weekCellColors(val: number | null | undefined, target: number | null | undefined) {
  if (val === null || val === undefined) return { bg: "", text: "text-gray-300" };
  const weeklyTarget = (target ?? 0) / 13;
  if (val === 0) return { bg: "bg-red-500", text: "text-white" };
  if (weeklyTarget > 0 && val >= weeklyTarget) return { bg: "bg-blue-500", text: "text-white" };
  return { bg: "bg-green-500", text: "text-white" };
}
