/**
 * Excel cell fill colors for exports — kept in lock-step with the on-screen UI.
 *
 * Rather than hard-code hexes, we drive fills from the SAME logic the tables
 * use: the KPI traffic-light (`getColorByPercentage`) and the canonical status
 * palette (`STATUS_CELL_BG`). Each returns a Tailwind `bg-*` class, which we map
 * to an ARGB hex here (the single place hexes live).
 */
import { getColorByPercentage } from "@/lib/utils/colorLogic";
import { statusCellBg } from "@/lib/constants/status";

/** Tailwind `bg-*` class → Excel ARGB (default Tailwind palette hexes). */
const TW_BG_TO_ARGB: Record<string, string> = {
  // KPI weekly traffic-light (colorLogic.ts)
  "bg-blue-600": "FF2563EB",
  "bg-green-600": "FF16A34A",
  "bg-yellow-500": "FFEAB308",
  "bg-red-600": "FFDC2626",
  // Priority / WWW status (status.ts STATUS_CELL_BG)
  "bg-blue-500": "FF3B82F6",
  "bg-green-500": "FF22C55E",
  "bg-amber-400": "FFFBBF24",
  "bg-red-500": "FFEF4444",
  "bg-gray-400": "FF9CA3AF",
};

/** Extract the first `bg-*` token from a className string and map it to ARGB. */
export function argbForClassName(className: string | null | undefined): string | undefined {
  if (!className) return undefined;
  for (const token of className.split(/\s+/)) {
    if (token.startsWith("bg-") && TW_BG_TO_ARGB[token]) return TW_BG_TO_ARGB[token];
  }
  return undefined;
}

/**
 * Fill for a KPI weekly cell. Mirrors the table's traffic-light: value vs the
 * week's target, only colored once a value is entered (`updated`), honoring the
 * KPI's reverse-color flag. Returns undefined for the neutral (not-entered) state.
 */
export function kpiWeekArgb(
  value: number,
  target: number,
  updated: boolean,
  reverse: boolean,
): string | undefined {
  const { bg } = getColorByPercentage(value, target, updated, reverse);
  return argbForClassName(bg);
}

/**
 * Fill for a Priority weekly-status / WWW status cell. Uses the canonical
 * `STATUS_CELL_BG` map so exports match the tables exactly. Unknown / empty
 * status → no fill.
 */
export function statusArgb(status: string | null | undefined): string | undefined {
  return argbForClassName(statusCellBg(status));
}
