import type { CriticalTier } from "@/lib/utils/criticalNumberTiers";

/**
 * Tier colours for Critical Numbers.
 *
 * These are SEMANTIC data-state colours, so per CLAUDE.md's accent-colour rules
 * they stay hardcoded rather than becoming `accent-*` — a tenant with a purple
 * theme still needs "Bad" to read red.
 *
 * Aligned to KPI's status palette (`lib/utils/colorLogic.ts`), which is the
 * app's canonical 4-state metric scale: blue → green → yellow → red, with no
 * orange anywhere. Same four hexes, same top-to-bottom order, so a user reading
 * a KPI cell and a Critical Number gauge learns one colour language.
 *
 * The boundaries now come from KPI too: `resolveTargetTier` delegates to
 * `getColorByPercentage`, so blue genuinely means ≥120% in both modules. Four
 * tiers, not five.
 *
 * Deliberately NOT synced with OPSP's Critical-# colours — that's a separate
 * feature and its two palettes already disagree with each other.
 */
export const TIER_HEX: Record<CriticalTier, string> = {
  great: "#2563eb", // blue-600
  good: "#16a34a", // green-600
  concerned: "#eab308", // yellow-500
  bad: "#dc2626", // red-600
};

/** Tailwind classes for the same four states — text / soft background / border. */
export const TIER_CLASSES: Record<CriticalTier, { text: string; bg: string; border: string }> = {
  great: { text: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  good: { text: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
  concerned: { text: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
  bad: { text: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
};

/** Neutral styling for "no tier yet" — unconfigured, no data, or not started. */
export const TIER_UNKNOWN = {
  hex: "#d1d5db", // gray-300
  text: "text-gray-500",
  bg: "bg-gray-50",
  border: "border-gray-200",
};
