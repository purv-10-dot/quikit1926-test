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
): number {
  const explicit = kpi.weeklyTargets?.[String(week)];
  if (explicit != null) return explicit;
  return (kpi.qtdGoal ?? kpi.target ?? 0) / 13;
}

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
