/**
 * Tier resolution for Critical Numbers — pure functions, no React, no DB.
 *
 * One rule, always on: score `currentValue` against `targetValue` on KPI's
 * percentage bands. The bands are not reimplemented here — `resolveTargetTier`
 * calls KPI's own `getColorByPercentage` and translates the class it returns,
 * so there is a single definition of what "good" means across the app.
 *
 * Retired with the v2 redesign: the custom_targets / time_based split, the
 * linear-pacing model (`resolveTimeBasedTier`, `PACE_BANDS`, the calendar-day
 * timezone handling) and the OPSP threshold adapter (`resolveCustomTargetTier`).
 * Those are gone from the schema, so the code and its tests went with them.
 */

import { toNum } from "@/lib/utils/opspHelpers";
import { getColorByPercentage } from "@/lib/utils/colorLogic";

/** The four tiers, in descending order of health. */
export type CriticalTier = "great" | "good" | "concerned" | "bad";

export const CRITICAL_TIER_LABELS: Record<CriticalTier, string> = {
  great: "Over Achieved",
  good: "Achieved",
  concerned: "Near",
  bad: "Below",
};

/**
 * KPI's Tailwind class → our tier vocabulary.
 *
 * Deliberately keyed on the classes `colorLogic` actually returns rather than
 * re-deriving bands here. If KPI ever moves a boundary, this follows for free;
 * if KPI renames a class, the lookup misses and the tier goes null (visibly
 * "no status") instead of silently mis-colouring — a loud failure beats a
 * quiet wrong one.
 *
 * The hexes behind these classes are exactly TIER_HEX, so a Critical Number
 * and a KPI cell at the same percentage are the same colour.
 */
const KPI_CLASS_TO_TIER: Readonly<Record<string, CriticalTier>> = {
  "bg-blue-600": "great", // ≥120% — exceeded
  "bg-green-600": "good", // ≥100% — achieved
  "bg-yellow-500": "concerned", // 80–99% — near
  "bg-red-600": "bad", // <80% — below
};

export type TargetTierUnavailable = "no-data" | "no-target";

export interface TargetTierResult {
  tier: CriticalTier | null;
  /** currentValue ÷ targetValue × 100. Null when the target isn't positive. */
  percentage: number | null;
  /** Set only when `tier` is null. */
  reason?: TargetTierUnavailable;
}

/**
 * Resolve a Critical Number's tier from its value against its target.
 *
 * The band maths is NOT reimplemented — this calls KPI's own
 * `getColorByPercentage` and translates the class it returns, so there is one
 * definition of the bands shared by both modules.
 *
 * `isUpdated` is passed as `true` because a null `currentValue` is already
 * short-circuited above — that flag is precisely KPI's "has a value been
 * entered", and conflating it with "below target" is what would turn a
 * brand-new metric red.
 *
 * `reverse` is hard-wired false: the schema has no `reverseColor` column.
 * Adding one later is a one-argument change, since colorLogic already
 * implements the inverted bands.
 *
 * A non-positive target is passed straight through so KPI's own edge-case
 * handling applies verbatim (target ≤ 0 with a positive value reads as
 * exceeded); we only guard a *missing* target, which KPI can't express.
 */
export function resolveTargetTier(input: {
  currentValue: number | string | null | undefined;
  targetValue: number | string | null | undefined;
}): TargetTierResult {
  const target = toNum(input.targetValue);
  if (target === null) return { tier: null, percentage: null, reason: "no-target" };

  const current = toNum(input.currentValue);
  if (current === null) return { tier: null, percentage: null, reason: "no-data" };

  const { bg } = getColorByPercentage(current, target, true, false);
  return {
    tier: KPI_CLASS_TO_TIER[bg] ?? null,
    percentage: target > 0 ? (current / target) * 100 : null,
  };
}
