/**
 * RAG colour bands for the multi-user Habits aggregate dashboard.
 *
 * Different thresholds from `colorLogic.ts` (which is tuned to KPI
 * attainment %: 80 / 100 / 120). Habits aggregate is a 0–1 agreement
 * rate across N respondents, so we use 60 / 80 as the cuts — confirmed
 * with the client's "82 / 61 / 64%" examples.
 *
 *   pct ≥ 0.80 → green  (diligently followed)
 *   pct ≥ 0.60 → amber  (mixed)
 *   pct <  0.60 → red    (needs attention)
 *
 * Returned colour classes match the maturity-band palette already in
 * habitSchema.ts so the History badge + AggregateView bars are visually
 * consistent.
 */

export type HabitRag = "green" | "amber" | "red";

export interface HabitRagStyle {
  rag: HabitRag;
  badgeBg: string;
  badgeText: string;
  barBg: string;
}

const STYLES: Record<HabitRag, HabitRagStyle> = {
  green: { rag: "green", badgeBg: "bg-green-100", badgeText: "text-green-700", barBg: "bg-green-500" },
  amber: { rag: "amber", badgeBg: "bg-amber-100", badgeText: "text-amber-700", barBg: "bg-amber-400" },
  red:   { rag: "red",   badgeBg: "bg-red-100",   badgeText: "text-red-700",   barBg: "bg-red-400"   },
};

export function ragForPct(pct: number): HabitRagStyle {
  if (pct >= 0.8) return STYLES.green;
  if (pct >= 0.6) return STYLES.amber;
  return STYLES.red;
}

export function ragForHabit(pct: number): HabitRag {
  return ragForPct(pct).rag;
}
