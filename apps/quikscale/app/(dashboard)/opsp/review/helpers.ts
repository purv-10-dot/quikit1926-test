/**
 * Shared review helpers — kept tiny on purpose so both the Review table and
 * the new Critical Review tables can import the same traffic-light logic
 * without duplicating it.
 */

/**
 * Map an achieved percentage (achieved / projected × 100) to a Tailwind
 * background class. Thresholds match the existing OPSP Review KPI
 * traffic-lights (≥120 blue, ≥100 green, ≥80 yellow, <80 red).
 */
export function achievedPctColor(pct: number): string {
  if (pct >= 120) return "bg-blue-600";
  if (pct >= 100) return "bg-green-600";
  if (pct >= 80) return "bg-yellow-500";
  return "bg-red-600";
}

/**
 * CritBlock bullet palette (mirror of `BULLET_COLORS` in
 * apps/quikscale/app/(dashboard)/opsp/components/CritBlock.tsx) — kept here
 * so the Critical Review tab can render the same colored dots without
 * importing from the create-OPSP component tree.
 */
export const CRIT_BULLET_COLORS = ["#1a5c2e", "#4caf50", "#f5c518", "#e53935"] as const;

export const CRIT_BULLET_LABELS = ["Green", "Light Green", "Yellow", "Red"] as const;
