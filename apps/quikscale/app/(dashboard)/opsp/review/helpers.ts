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

export const CRIT_BULLET_LABELS = [
  "Super Green",
  "Light Green",
  "Yellow",
  "Red",
] as const;

/**
 * Display formatter for Review table numeric cells (Target / Achieved / Gap /
 * Last Year Same Period). Caps fractional digits at 2 so values like
 * `173.333333` render as `173.33`, while whole numbers stay clean
 * (`833` — no forced `.00`). Locale-formatted, so thousands separators
 * still appear (e.g. `1,234,567.89`).
 *
 * Returns `"—"` for null/undefined so callers can drop the explicit guard.
 */
export function formatReviewNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
