import { z } from "zod";

export const SURVEY_TYPES = ["enps", "cnps"] as const;
export const SURVEY_STATUSES = ["draft", "active", "closed"] as const;
export type SurveyType = (typeof SURVEY_TYPES)[number];
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export const SURVEY_TYPE_CONFIG = {
  enps: {
    label: "eNPS",
    fullLabel: "Employee NPS",
    description: "Measure how likely employees are to recommend your company as a place to work.",
    defaultQuestion: "On a scale of 0–10, how likely are you to recommend this company as a place to work?",
    audience: "Employees",
    color: "violet",
    bg: "bg-violet-50",
    border: "border-violet-200",
    headerBg: "bg-violet-100",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-700",
    dotColor: "bg-violet-500",
  },
  cnps: {
    label: "cNPS",
    fullLabel: "Customer NPS",
    description: "Measure how likely customers are to recommend your product or service.",
    defaultQuestion: "On a scale of 0–10, how likely are you to recommend our product/service to a friend or colleague?",
    audience: "Customers",
    color: "blue",
    bg: "bg-blue-50",
    border: "border-blue-200",
    headerBg: "bg-blue-100",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-700",
    dotColor: "bg-blue-500",
  },
} as const satisfies Record<SurveyType, object>;

export const NPS_CATEGORIES = {
  promoter:  { label: "Promoter",  min: 9, max: 10, color: "text-green-600",  bg: "bg-green-100",  border: "border-green-200" },
  passive:   { label: "Passive",   min: 7, max: 8,  color: "text-amber-600",  bg: "bg-amber-100",  border: "border-amber-200" },
  detractor: { label: "Detractor", min: 0, max: 6,  color: "text-red-600",    bg: "bg-red-100",    border: "border-red-200" },
} as const;

export type NpsCategory = keyof typeof NPS_CATEGORIES;

export function getNpsCategory(score: number): NpsCategory {
  if (score >= 9) return "promoter";
  if (score >= 7) return "passive";
  return "detractor";
}

export function calcNps(responses: { score: number }[]): number {
  if (!responses.length) return 0;
  const promoters  = responses.filter((r) => r.score >= 9).length;
  const detractors = responses.filter((r) => r.score <= 6).length;
  return Math.round(((promoters - detractors) / responses.length) * 100);
}

export function calcYesNoBreakdown(answers: { scoreBool: boolean | null }[]) {
  const valid = answers.filter((a) => a.scoreBool !== null && a.scoreBool !== undefined) as { scoreBool: boolean }[];
  const total = valid.length;
  const yes   = valid.filter((a) => a.scoreBool).length;
  const no    = total - yes;
  return {
    total,
    yes,
    no,
    yesPct: total ? Math.round((yes / total) * 100) : 0,
    noPct:  total ? Math.round((no  / total) * 100) : 0,
  };
}

export function calcNpsBreakdown(responses: { score: number }[]) {
  const total      = responses.length;
  const promoters  = responses.filter((r) => r.score >= 9).length;
  const passives   = responses.filter((r) => r.score >= 7 && r.score <= 8).length;
  const detractors = responses.filter((r) => r.score <= 6).length;
  return {
    total,
    promoters,
    passives,
    detractors,
    promoterPct:  total ? Math.round((promoters  / total) * 100) : 0,
    passivePct:   total ? Math.round((passives   / total) * 100) : 0,
    detractorPct: total ? Math.round((detractors / total) * 100) : 0,
    nps:          total ? Math.round(((promoters - detractors) / total) * 100) : 0,
  };
}

// ─── Per-question types ────────────────────────────────────────────────────────

export const ANSWER_TYPES = ["nps_rank", "yes_no"] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

export const questionInputSchema = z.object({
  text:         z.string().min(1).max(500),
  answerType:   z.enum(ANSWER_TYPES).default("nps_rank"),
  allowComment: z.boolean().default(false),
  required:     z.boolean().default(true),
});

export type QuestionInput = z.infer<typeof questionInputSchema>;

// At least one NPS-rank question is required for enps/cnps types so the
// NPS analytics card on the index page has a target.
function hasNpsRankQuestion(qs: QuestionInput[]): boolean {
  return qs.some((q) => q.answerType === "nps_rank");
}

// ─── Survey create / update ───────────────────────────────────────────────────

export const createSurveySchema = z.object({
  type:      z.enum(SURVEY_TYPES),
  title:     z.string().min(1).max(200),
  /// Legacy single-question field — accepted for one release, converted to questions[0] server-side.
  question:  z.string().min(1).max(500).optional(),
  questions: z.array(questionInputSchema).min(1).max(20).optional(),
  quarter:   z.string().regex(/^Q[1-4]$/),
  year:      z.number().int().min(2020).max(2100),
}).refine(
  (data) => Boolean(data.questions?.length) || Boolean(data.question),
  { message: "At least one question is required", path: ["questions"] },
).refine(
  (data) => !data.questions || hasNpsRankQuestion(data.questions),
  { message: "At least one NPS Rank question is required for eNPS/cNPS surveys", path: ["questions"] },
);

export const updateSurveySchema = z.object({
  title:        z.string().min(1).max(200).optional(),
  status:       z.enum(SURVEY_STATUSES).optional(),
  /// Append-only on a survey with responses; full edit otherwise. Server enforces.
  addQuestions: z.array(questionInputSchema).max(20).optional(),
  /// Reorder existing questions — array of { id, order }. Server enforces dense 0-based.
  reorder:      z.array(z.object({ id: z.string(), order: z.number().int().min(0) })).optional(),
});

// ─── Response submission ──────────────────────────────────────────────────────

export const answerInputSchema = z.object({
  questionId: z.string(),
  scoreInt:   z.number().int().min(0).max(10).optional(),
  scoreBool:  z.boolean().optional(),
  comment:    z.string().max(2000).optional(),
}).refine(
  (a) => a.scoreInt !== undefined || a.scoreBool !== undefined,
  { message: "Each answer must have either scoreInt or scoreBool", path: ["scoreInt"] },
);

export type AnswerInput = z.infer<typeof answerInputSchema>;

export const submitResponseSchema = z.object({
  /// New shape — preferred.
  answers:         z.array(answerInputSchema).optional(),
  /// Legacy single-score shape — accepted for one release, converted server-side.
  score:           z.number().int().min(0).max(10).optional(),
  comment:         z.string().max(2000).optional(),
  respondentName:  z.string().max(200).optional(),
  respondentEmail: z.string().email().optional().or(z.literal("")),
}).refine(
  (data) => Boolean(data.answers?.length) || data.score !== undefined,
  { message: "Provide answers[] or legacy score", path: ["answers"] },
);
