import { getColorByPercentage, type ColorResult } from "./colorLogic";
import { CURRENCIES, getMultiplier, shortScaleLabel } from "./currency";

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

/** Dashboard number-format mode — Western abbreviations vs the Indian system. */
export type NumberFormat = "standard" | "indian";

/**
 * Compact format using the Indian numbering system: thousand (K), lakh (L,
 * 1e5), crore (Cr, 1e7), arab (Ar, 1e9). Mirrors `fmtCompact`'s decimal trimming
 * and sign handling. e.g. 12_500_000 → "1.25Cr", 849_000 → "8.49L", 5_000 → "5K".
 * Used only by the Dashboard (gated behind the `use_indian_numbering` toggle).
 */
export function fmtCompactIndian(val: number | null | undefined): string {
  if (val === null || val === undefined) return "—";
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return sign + parseFloat((abs / 1_000_000_000).toFixed(2)) + "Ar";
  if (abs >= 10_000_000)    return sign + parseFloat((abs / 10_000_000).toFixed(2)) + "Cr";
  if (abs >= 100_000)       return sign + parseFloat((abs / 100_000).toFixed(2)) + "L";
  if (abs >= 1_000)         return sign + parseFloat((abs / 1_000).toFixed(1)) + "K";
  return fmt(val);
}

/**
 * Dispatch compact formatting by mode. `"indian"` → lakh/crore/arab; anything
 * else → the standard K/M/B abbreviations. `fmtCompact` itself is unchanged, so
 * every surface that doesn't opt into a format stays byte-identical.
 */
export function fmtCompactBy(val: number | null | undefined, format: NumberFormat = "standard"): string {
  return format === "indian" ? fmtCompactIndian(val) : fmtCompact(val);
}

/**
 * Display formatter for KPI goal/value numbers that respects a Currency KPI's
 * chosen scale unit. Display-only — stored values stay RAW.
 *
 * Gated by the per-KPI `scaledDisplay` toggle: scale-unit rendering only applies
 * when `scaledDisplay` is true AND the KPI is Currency with a chosen scale.
 * Otherwise it falls back to plain compact (toggle-driven) — today's behaviour.
 *
 * Rules (see docs/deferred/currency-scale-display.md):
 *   - Currency + scale + scaledDisplay, INR → scaled unit with ₹ ("₹4 Cr").
 *   - Currency + scale + scaledDisplay, non-INR → toggle OFF native scale ("$9 M");
 *     toggle ON Indian magnitude keeping the symbol ("$90L").
 *   - scaledDisplay off / no scale / non-currency → plain compact (Indian for INR).
 */
export function formatScaledKpiValue(
  val: number | null | undefined,
  opts: {
    measurementUnit?: string | null;
    currency?: string | null;
    targetScale?: string | null;
    numberFormat?: NumberFormat;
    /** Per-KPI scale-unit display toggle. When false, no scale-unit rendering. */
    scaledDisplay?: boolean;
    /** Unit-of-measure for a Number KPI (from Unit Master, e.g. "lb"); appended as a suffix. */
    unit?: string | null;
  },
): string {
  if (val == null) return "—";
  const { measurementUnit, currency, targetScale, numberFormat = "standard", scaledDisplay = false, unit } = opts;
  if (scaledDisplay && measurementUnit === "Currency" && currency && targetScale) {
    const m = getMultiplier(currency, targetScale);
    if (m > 1) {
      const symbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? "";
      // non-INR + toggle ON → Indian magnitude keeping the symbol ("$90L"); INR ignores the toggle.
      if (currency !== "INR" && numberFormat === "indian") return `${symbol}${fmtCompactIndian(val)}`;
      const scaled = parseFloat((val / m).toFixed(2)).toString();
      const unit = shortScaleLabel(targetScale);
      return `${symbol}${scaled}${unit ? ` ${unit}` : ""}`; // "₹4 Cr" / "$9 M"
    }
  }
  // No scale / non-currency: INR forces Indian even when the toggle is off.
  const effective: NumberFormat = currency === "INR" ? "indian" : numberFormat;
  const base = fmtCompactBy(val, effective);
  // Number KPI with a Unit Master unit → append it ("16 lb", "150K lb").
  if (measurementUnit === "Number" && unit) return `${base} ${unit}`;
  return base;
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
 * Badge-friendly variant of the color helper for progress READOUTS — places
 * where a percentage label sits on a white card/row alongside a filled bar.
 *
 * Why this exists separately from `getColorByPercentage`: that helper's
 * `text` field is `"text-white"` for BLUE/GREEN/YELLOW/RED because it's
 * designed for cells where the colored background covers the text (e.g.
 * the weekly KPI cells). Reusing that `text` value on a white row makes
 * the percentage invisible.
 *
 * This helper maps the same color bucket to a **readable-on-white** text
 * tone and a human label, while internally calling `getColorByPercentage`
 * so every documented rule (isUpdated gating, reverse mode, target ≤ 0
 * special-case) stays honored.
 *
 * Use it for:
 *   - KPICard on the Dashboard
 *   - Progress column in KPITable
 *   - StatsTab "Overall Progress" block
 *   - Any future inline progress readout
 *
 * Do NOT use it for cells that paint the full background with the color
 * (weekly KPI cells, QTD Achieved cell). Those want `getColorByPercentage`
 * directly so `text-white` applies on top of the colored bg.
 */
export function getProgressBadgeColors(
  value: number,
  target: number,
  isUpdated: boolean,
  reverse: boolean = false,
): { bar: string; text: string; label: string } {
  const color = getColorByPercentage(value, target, isUpdated, reverse);
  if (color.bg === "bg-blue-600")   return { bar: "bg-blue-600",   text: "text-blue-700",   label: reverse ? "Much Better"    : "Exceeded"     };
  if (color.bg === "bg-green-600")  return { bar: "bg-green-600",  text: "text-green-700",  label: reverse ? "On Track"       : "Achieved"     };
  if (color.bg === "bg-yellow-500") return { bar: "bg-yellow-500", text: "text-yellow-600", label: reverse ? "Slightly Worse" : "Near Target"  };
  if (color.bg === "bg-red-600")    return { bar: "bg-red-600",    text: "text-red-700",    label: reverse ? "Poor"           : "Below Target" };
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
/**
 * The target for a single week, matching what the Updates tab renders:
 * the explicit `weeklyTargets[week]` if the KPI has one configured, otherwise
 * the flat `(qtdGoal ?? target) / 13` distribution. Mirrors LogModal's
 * per-row target so audit cards and the editor agree.
 */
export function weeklyTargetForWeek(
  kpi: {
    weeklyTargets?: Record<string, number> | null;
    qtdGoal?: number | null;
    target?: number | null;
  },
  week: number,
  weeksPerQuarter: number = 13,
): number {
  const explicit = kpi.weeklyTargets?.[String(week)];
  if (explicit != null) return explicit;
  return (kpi.qtdGoal ?? kpi.target ?? 0) / weeksPerQuarter;
}

/**
 * Weekly Goal for a specific week — the pure primitive behind the KPI table's
 * "Weekly Goal" column, the Stats tile, and the export column, so all three
 * agree. Uses the explicit `weeklyTargets[week]` when configured, otherwise the
 * flat `(target ?? qtdGoal) / weeksPerQuarter` split.
 *
 * Fallback order is `target ?? qtdGoal` (NOT `qtdGoal ?? target` like
 * `weeklyTargetForWeek`) to match `kpiStats.weeklyGoalFor`, which the table
 * renders — the export previously emitted raw `qtdGoal` here (e.g. 1300 instead
 * of 100), the bug this helper fixes.
 */
export function computeWeeklyGoal(
  weeklyTargets: Record<string, unknown> | null | undefined,
  target: number | null | undefined,
  qtdGoal: number | null | undefined,
  weekNumber: number,
  weeksPerQuarter: number = 13,
): number {
  const raw = weeklyTargets?.[String(weekNumber)];
  if (typeof raw === "number") return raw;
  const total = target ?? qtdGoal ?? 0;
  return total > 0 ? total / weeksPerQuarter : 0;
}

export function weekCellColors(
  val: number | null | undefined,
  qtdGoal: number | null | undefined,
  fallbackTarget: number | null | undefined = null,
  reverse: boolean = false,
  weeksPerQuarter: number = 13,
): { bg: string; text: string; label: string } {
  const weeklyTarget = ((qtdGoal ?? fallbackTarget ?? 0)) / weeksPerQuarter;
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

/**
 * Resolve the "last note" to display in the KPI table's Last Notes column.
 *
 * Source priority:
 *   1. Highest weekNumber in `weeklyValues` that has a non-empty `notes`
 *      (mirrors Priority's `lastNote` pattern — most recent weekly note wins)
 *   2. Fallback to `kpi.lastNotes` — the denormalized field written ONLY by
 *      `POST /api/kpi/[id]/notes` (the general KPI-level notes endpoint).
 *      Per-week notes save to `KPIWeeklyValue.notes` and do NOT update that
 *      field, so reading it alone misses weekly notes entirely (the bug this
 *      helper fixes).
 *
 * Returns `null` when nothing is available, so callers can render `—`.
 */
export function getLatestWeeklyNote(kpi: {
  weeklyValues?: Array<{ weekNumber: number; notes?: string | null }> | null;
  lastNotes?: string | null;
}): { note: string; weekNumber: number | null } | null {
  let best: { note: string; weekNumber: number } | null = null;
  for (const wv of kpi.weeklyValues ?? []) {
    const n = wv.notes?.trim();
    if (n && (best == null || wv.weekNumber > best.weekNumber)) {
      best = { note: n, weekNumber: wv.weekNumber };
    }
  }
  if (best) return best;
  const fallback = kpi.lastNotes?.trim();
  if (fallback) return { note: fallback, weekNumber: null };
  return null;
}
