/**
 * Recruiter Performance Score — 8 weighted KPIs (management's own scorecard,
 * not an ad-hoc model), each normalized 0-100 against a floor/target/ceiling,
 * then combined.
 *
 *   - Time to Hire is a day-count RATIO (actual ÷ target SLA days) — 100
 *     at/under the SLA, 0 at 2× the SLA.
 *   - Time to Offer is deadline-DISCIPLINE, not a day-count: this org's
 *     process is "a missed Position→Offer deadline always gets revised", so
 *     it's scored per position from slaRevisionCount — 0 revisions → 100,
 *     1 → 50, 2+ → 0 — then averaged across the recruiter's seats (see
 *     recruiter-performance/route.ts, which computes this).
 *   - Every other KPI is already a 0-100 percentage, so its "normalization"
 *     is just a clamp — see floor:0, target:100 below, which makes
 *     normHigher(actual,0,100) collapse to clamp(actual,0,100).
 *   - Small-team guardrails (<10 recruiters): a KPI below its minimum
 *     sample size is excluded and its weight redistributed, never scored
 *     as zero, and the score is never turned into a 1..N rank.
 *
 * Deliberately NOT built yet (flagged, not hidden): per-tenant config UI
 * for these weights/floors/targets (they're constants here, not a DB
 * table), the frozen historical "scorecard" snapshot, and an ownership
 * ledger for splitting blame when a candidate changes recruiters mid-way.
 */

export type KpiDirection = "higher_better" | "lower_better";

export interface KpiDef {
  code: string;
  label: string;
  weightPct: number;
  direction: KpiDirection;
  floor: number;
  target: number;
  /** Only used for lower_better KPIs (the "ceiling" score-of-zero point). */
  ceiling?: number;
  minSampleSize: number;
}

// Weights don't need to sum to 100 — computeRecruiterScore always
// redistributes whatever's actually included back up to 100% (see
// totalActiveWeight below), so removing a KPI here just spreads its share
// across the rest automatically.
export const KPI_DEFS: KpiDef[] = [
  { code: "TIME_TO_OFFER", label: "Time to Offer", weightPct: 20, direction: "higher_better", floor: 0, target: 100, minSampleSize: 1 },
  { code: "TIME_TO_HIRE", label: "Time to Hire", weightPct: 10, direction: "lower_better", floor: 0, target: 1, ceiling: 2, minSampleSize: 1 },
  { code: "SLA_COMPLIANCE", label: "SLA Compliance", weightPct: 20, direction: "higher_better", floor: 0, target: 100, minSampleSize: 1 },
  { code: "INTERVIEW_TO_OFFER", label: "Interview → Offer", weightPct: 10, direction: "higher_better", floor: 0, target: 100, minSampleSize: 5 },
  { code: "OFFER_ACCEPTANCE", label: "Offer Acceptance Rate", weightPct: 10, direction: "higher_better", floor: 0, target: 100, minSampleSize: 3 },
  { code: "OFFER_TO_JOINING", label: "Offer → Joining Ratio", weightPct: 10, direction: "higher_better", floor: 0, target: 100, minSampleSize: 1 },
  { code: "POSITION_CLOSURE", label: "Position Closure Rate", weightPct: 10, direction: "higher_better", floor: 0, target: 100, minSampleSize: 1 },
  { code: "PROCESS_COMPLIANCE", label: "Recruitment Process Compliance", weightPct: 10, direction: "higher_better", floor: 0, target: 100, minSampleSize: 3 },
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Higher-is-better: 0 at/below floor, 100 at/above target. */
export function normHigher(actual: number, floor: number, target: number): number {
  if (target === floor) return actual >= target ? 100 : 0;
  return clamp(((actual - floor) / (target - floor)) * 100, 0, 100);
}

/** Lower-is-better (ratios, e.g. actual days / SLA days): 100 at/below target, 0 at/above ceiling. */
export function normLower(actual: number, ceiling: number, target: number): number {
  if (ceiling === target) return actual <= target ? 100 : 0;
  return clamp(((ceiling - actual) / (ceiling - target)) * 100, 0, 100);
}

export function normalize(kpi: KpiDef, actual: number): number {
  return kpi.direction === "higher_better"
    ? normHigher(actual, kpi.floor, kpi.target)
    : normLower(actual, kpi.ceiling ?? kpi.floor, kpi.target);
}

export type Band = "Excellent" | "Strong" | "Needs Attention" | "Below Expectations" | "Critical";

export function bandFor(score: number): Band {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Strong";
  if (score >= 70) return "Needs Attention";
  if (score >= 60) return "Below Expectations";
  return "Critical";
}

export interface KpiInput {
  code: string;
  /** Raw metric value in the KPI's own unit (percent as 0-100, or a day-ratio for Hiring Speed). */
  value: number | null;
  /** How many records this value was computed from — drives the sample-size gate. */
  sampleSize: number;
}

export interface KpiBreakdownRow {
  code: string;
  label: string;
  value: number | null;
  sampleSize: number;
  weightPct: number;
  effectiveWeightPct: number | null; // null when excluded for insufficient data
  normalizedScore: number | null;
  included: boolean;
  insufficientData: boolean;
}

export interface RecruiterScoreResult {
  overallScore: number | null;
  band: Band | null;
  scoredKpiCount: number;
  totalKpiCount: number;
  breakdown: KpiBreakdownRow[];
}

/**
 * Combine the 7 KPI inputs into one score. A KPI below its minimum sample
 * size is excluded (never scored as zero) and its weight is redistributed
 * proportionally across the KPIs that DO qualify — see the source doc's
 * "Handling insufficient data" rule. If every KPI is excluded, the overall
 * score is null (show "Insufficient history", not a fabricated number).
 */
export function computeRecruiterScore(inputs: KpiInput[]): RecruiterScoreResult {
  const byCode = new Map(inputs.map((i) => [i.code, i]));
  const rows: KpiBreakdownRow[] = KPI_DEFS.map((kpi) => {
    const input = byCode.get(kpi.code);
    const sampleSize = input?.sampleSize ?? 0;
    const insufficientData = input == null || input.value == null || sampleSize < kpi.minSampleSize;
    const normalizedScore = insufficientData || input!.value == null ? null : normalize(kpi, input!.value);
    return {
      code: kpi.code, label: kpi.label, value: input?.value ?? null, sampleSize,
      weightPct: kpi.weightPct, effectiveWeightPct: null,
      normalizedScore, included: !insufficientData, insufficientData,
    };
  });

  const includedRows = rows.filter((r) => r.included && r.normalizedScore != null);
  const totalActiveWeight = includedRows.reduce((s, r) => s + r.weightPct, 0);

  if (includedRows.length === 0 || totalActiveWeight === 0) {
    return { overallScore: null, band: null, scoredKpiCount: 0, totalKpiCount: KPI_DEFS.length, breakdown: rows };
  }

  let overallScore = 0;
  for (const r of rows) {
    if (!r.included || r.normalizedScore == null) continue;
    r.effectiveWeightPct = Math.round((r.weightPct / totalActiveWeight) * 1000) / 10;
    overallScore += r.normalizedScore * (r.effectiveWeightPct / 100);
  }
  overallScore = Math.round(overallScore * 10) / 10;

  return {
    overallScore, band: bandFor(overallScore),
    scoredKpiCount: includedRows.length, totalKpiCount: KPI_DEFS.length,
    breakdown: rows,
  };
}
