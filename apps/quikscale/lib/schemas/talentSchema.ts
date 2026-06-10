import { z } from "zod";

// ─── Legacy 9-box fields (kept for back-compat & secondary reporting) ─────────
const POTENTIAL = ["low", "medium", "high"] as const;
const FLIGHT    = ["low", "medium", "high"] as const;
const SUCCESSION = ["ready", "developing", "not-ready", "ready-now"] as const;

// ─── Scaling-Up fields ────────────────────────────────────────────────────────
export const REHIRE_DECISION = ["enthusiastic", "probably", "no", "unrated"] as const;
export type RehireDecision = (typeof REHIRE_DECISION)[number];

export const RIGHT_SEAT = ["yes", "blurry", "wrong", "unrated"] as const;
export type RightSeat = (typeof RIGHT_SEAT)[number];

export const CAPACITY = ["stretched", "right-sized", "underused"] as const;
export type Capacity = (typeof CAPACITY)[number];

export const talentAssessmentSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  // Legacy 9-box (still accepted)
  potential: z.enum(POTENTIAL).default("medium"),
  flightRisk: z.enum(FLIGHT).default("low"),
  successionReady: z.enum(SUCCESSION).default("not-ready"),
  skills: z.array(z.string()).default([]),
  developmentNotes: z.string().nullable().optional(),
  // Scaling-Up additions (all optional — manager can save partial state)
  rehireDecision: z.enum(REHIRE_DECISION).default("unrated"),
  rightSeat: z.enum(RIGHT_SEAT).default("unrated"),
  coreValuesScore: z.number().int().min(1).max(5).nullable().optional(),
  capacity: z.enum(CAPACITY).nullable().optional(),
  doMore: z.string().max(2000).nullable().optional(),
  doLess: z.string().max(2000).nullable().optional(),
  // Period
  quarter: z.string().regex(/^Q[1-4]$/, "Quarter must be Q1-Q4").default("Q1"),
  year: z.coerce.number().int().min(2000).max(2100).default(new Date().getFullYear()),
});

export type TalentAssessmentInput = z.infer<typeof talentAssessmentSchema>;

// ─── Performance score helper (shared by GET + POST so they cannot drift) ────
/**
 * Composite performance score, 0–100. Weighted average of KPI hit (50%),
 * priority completion (30%), and daily-huddle attendance (20%). Weights
 * are normalized over non-null inputs — if a signal is null the others
 * compensate. Returns null when *all* signals are null.
 */
export function computePerformanceScore(input: {
  kpiScore: number | null;
  priorityScore: number | null;
  huddleAttendancePct: number | null;
}): number | null {
  const signals: (number | null)[] = [input.kpiScore, input.priorityScore, input.huddleAttendancePct];
  const weights = [0.5, 0.3, 0.2];
  const totalW = signals.reduce<number>((sum, s, i) => sum + (s !== null ? weights[i]! : 0), 0);
  if (totalW === 0) return null;
  const num = signals.reduce<number>((sum, s, i) => (s !== null ? sum + s * weights[i]! : sum), 0);
  return Math.round(num / totalW);
}

// ─── Potential score helper (for the 4-quadrant dot plot) ────────────────────
/**
 * 0–100 potential score, derived from existing categorical inputs so the
 * 2×2 quadrant plot has a numeric Y-axis without forcing the manager to
 * fill yet another field.
 *
 *   coreValuesScore (1–5)  → 0–50 points  (×10)
 *   rehireDecision         → 0–50 points  (enthusiastic=50, probably=25, no=0)
 *
 * Returns null when BOTH inputs are missing — the dot drops out of the
 * plot and the person shows as "Not yet rated" instead of being mis-plotted
 * at the origin.
 */
export function computePotentialScore(input: {
  coreValuesScore?: number | null;
  rehireDecision?: string | null;
}): number | null {
  const cv = input.coreValuesScore ?? null;
  const rehire = input.rehireDecision ?? "unrated";

  if (cv === null && (rehire === "unrated" || !rehire)) return null;

  const cvPoints = cv !== null ? cv * 10 : 0;                    // 1→10 … 5→50
  const rehireBonus =
    rehire === "enthusiastic" ? 50
    : rehire === "probably"   ? 25
    : rehire === "no"         ? 0
    : 0;                                                          // unrated → 0

  return Math.max(0, Math.min(100, cvPoints + rehireBonus));
}

// ─── 4-quadrant placement (A/B/C/D) ──────────────────────────────────────────
/**
 * Maps a (performance, potential) pair onto the 2×2 quadrant labels.
 * Cut-line is 50% on both axes (mid-point of 0–100). Returns null when
 * either score is missing — the caller renders the person as "Not yet
 * rated" instead of mis-plotting them.
 *
 *   A — high performance + high potential   (top-right · stars)
 *   B — low  performance + high potential   (top-left  · future stars)
 *   C — high performance + low  potential   (bot-right · specialists)
 *   D — low  performance + low  potential   (bot-left  · at risk)
 */
export type Quadrant = "A" | "B" | "C" | "D";

export function quadrantFromScores(input: {
  performanceScore?: number | null;
  potentialScore?: number | null;
  /** Org benchmark cut-lines (0–100). Score ≥ cut = "high". Default 50/50. */
  perfCut?: number;
  potentialCut?: number;
}): Quadrant | null {
  const p = input.performanceScore ?? null;
  const q = input.potentialScore ?? null;
  if (p === null || q === null) return null;
  const perfCut = input.perfCut ?? 50;
  const potCut  = input.potentialCut ?? 50;
  const hiPerf = p >= perfCut;
  const hiPot  = q >= potCut;
  if (hiPerf && hiPot) return "A";
  if (!hiPerf && hiPot) return "B";
  if (hiPerf && !hiPot) return "C";
  return "D";
}

// ─── Benchmark validation ─────────────────────────────────────────────────────
export const DEFAULT_BENCHMARK = { perfCut: 50, potentialCut: 50 } as const;

// ─── A/B/C classification helper ──────────────────────────────────────────────
/**
 * Scaling Up A/B/C player classification.
 *
 * - A: "enthusiastically rehire" + values fit ≥ 4 + objective performance ≥ 70%
 * - C: "would not rehire" OR values fit < 3
 * - B: anything in between (default for mixed signals)
 * - null: no manager judgment yet and no usable auto-signal
 */
export function classifyTalent(input: {
  rehireDecision?: string | null;
  coreValuesScore?: number | null;
  performanceScore?: number | null;
}): "A" | "B" | "C" | null {
  const rehire = input.rehireDecision ?? "unrated";
  const cv     = input.coreValuesScore ?? null;
  const perf   = input.performanceScore ?? null;

  if (rehire === "no") return "C";
  if (cv !== null && cv < 3) return "C";

  if (rehire === "enthusiastic" && (cv ?? 0) >= 4 && (perf ?? 0) >= 70) return "A";

  if (rehire === "enthusiastic" || rehire === "probably") return "B";

  // No manager call — no classification yet.
  return null;
}

// ─── Quadrant-chart placement by classification ──────────────────────────────
/** The saved A/B/C "player" rating shown on the badge. There is no "D" rating. */
export type PlayerClass = "A" | "B" | "C";

/**
 * Plot coordinate for a person on the talent quadrant chart, derived from their
 * saved A/B/C `classification` (the badge) — NOT from quadrantFromScores().
 *
 * The two systems both use the letters A/B/C/D but disagree: quadrant "C" is a
 * high-performance Specialist while classification "C" is at-risk, so plotting
 * by score dropped a saved "C Player" into the chart's "D" box. The badge is
 * the source of truth, so we place the dot in the box that matches the rating:
 * A → top-right, B → top-left, C → bottom-right. The bottom-left "D" box is
 * left empty (the rating has no D). Dots are spread deterministically within
 * their box (userId hash → 0.2–0.8 of the box span) so they don't stack.
 */
export function classificationBoxPosition(
  classification: PlayerClass,
  userId: string,
  perfCut = 50,
  potentialCut = 50,
): { perf: number; pot: number } {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  const fx = 0.2 + ((Math.abs(h) % 100) / 100) * 0.6;
  const fy = 0.2 + ((Math.abs(h >> 5) % 100) / 100) * 0.6;
  const right = classification === "A" || classification === "C";
  const top = classification === "A" || classification === "B";
  const perf = right ? perfCut + fx * (100 - perfCut) : fx * perfCut;
  const pot = top ? potentialCut + fy * (100 - potentialCut) : fy * potentialCut;
  return { perf, pot };
}
