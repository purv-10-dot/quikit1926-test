import { z } from "zod";

export const HABIT_KEYS = [
  "habit1_vision",
  "habit2_meetings",
  "habit3_scoreboards",
  "habit4_accountable",
  "habit5_rhythm",
  "habit6_sticking",
  "habit7_cascading",
  "habit8_recognition",
  "habit9_training",
  "habit10_innovation",
] as const;

export type HabitKey = (typeof HABIT_KEYS)[number];

export const HABIT_DEFINITIONS: Record<HabitKey, { label: string; subItems: string[] }> = {
  habit1_vision: {
    label: "Executive team is healthy & aligned",
    subItems: [
      "Team members understand each other's differences, priorities, and styles",
      "The team meets frequently (weekly is best) for strategic thinking",
      "The team participates in ongoing executive education (monthly recommended)",
      "The team engages in constructive debates and all members feel comfortable participating",
    ],
  },
  habit2_meetings: {
    label: "Everyone aligned with the #1 thing this quarter",
    subItems: [
      "A Critical Number is identified to move the company ahead this quarter",
      "3–5 Priorities (Rocks) that support the Critical Number are identified and ranked",
      "A Quarterly Theme and Celebration/Reward are announced to all employees",
      "Quarterly Theme/Critical Number is posted throughout the company and progress is visible weekly",
    ],
  },
  habit3_scoreboards: {
    label: "Communication rhythm is established",
    subItems: [
      "All employees are in a daily huddle that lasts less than 15 minutes",
      "All teams have a weekly meeting",
      "Executives and middle managers meet monthly for learning and resolving big issues",
      "Quarterly and annual offsite planning sessions are held with executive and middle managers",
    ],
  },
  habit4_accountable: {
    label: "Every facet has a person accountable for goals",
    subItems: [
      "The Function Accountability Chart (FACe) is completed (right people, right things)",
      "Financial statements have a person assigned to each line item",
      "Each process on the Process Accountability Chart (PACe) has a named owner",
      "Each 3–5 year Key Thrust/Capability has a corresponding expert or Advisory Board member",
    ],
  },
  habit5_rhythm: {
    label: "Ongoing employee input is collected",
    subItems: [
      "All executives (and middle managers) have a Start/Stop/Keep conversation with at least one employee weekly",
      "Insights from employee conversations are shared at the weekly executive team meeting",
      "Employee input about obstacles and opportunities is collected weekly",
      "A mid-management team is responsible for closing the loop on all obstacles and opportunities",
    ],
  },
  habit6_sticking: {
    label: "Customer feedback is as frequent as financial data",
    subItems: [
      "All executives (and middle managers) have a 4Q conversation with at least one end user weekly",
      "Insights from customer conversations are shared at the weekly executive team meeting",
      "All employees are involved in collecting customer data",
      "A mid-management team is responsible for closing the loop on all customer feedback",
    ],
  },
  habit7_cascading: {
    label: "Core Values & Purpose are alive in the organization",
    subItems: [
      "Core Values are discovered, Purpose is articulated, and both are known by all employees",
      "All executives and middle managers refer back to Core Values and Purpose when praising or redirecting",
      "HR processes (hiring, orientation, appraisal, recognition) align with Core Values and Purpose",
      "Actions are identified and implemented each quarter to strengthen Core Values and Purpose",
    ],
  },
  habit8_recognition: {
    label: "Employees can articulate the key components of strategy",
    subItems: [
      "BHAG (Big Hairy Audacious Goal) — progress is tracked and visible",
      "Core Customer(s) — their profile in 25 words or less is known by all",
      "3 Brand Promises — and their corresponding KPIs are reported on weekly",
      "Elevator Pitch — a compelling response to 'What does your company do?' exists",
    ],
  },
  habit9_training: {
    label: "All employees can answer if they had a good day or week",
    subItems: [
      "1 or 2 Key Performance Indicators (KPIs) are reported on weekly for each role/person",
      "Each employee has 1 Critical Number that aligns with the company's Critical Number for the quarter",
      "Each individual/team has 3–5 Quarterly Priorities/Rocks that align with those of the company",
      "All executives and middle managers have a coach or peer coach holding them accountable",
    ],
  },
  habit10_innovation: {
    label: "Company plans & performance are visible to everyone",
    subItems: [
      "A 'situation room' is established for weekly meetings (physical or virtual)",
      "Core Values, Purpose, and Priorities are posted throughout the company",
      "Scoreboards display current progress on KPIs and Critical Numbers everywhere",
      "A system is in place for tracking and managing cascading Priorities and KPIs",
    ],
  },
};

export const MATURITY_LEVELS = [
  { label: "Starter",    min: 0,  max: 10, bg: "bg-red-100",    text: "text-red-700",    bar: "bg-red-400" },
  { label: "Developing", min: 11, max: 20, bg: "bg-amber-100",  text: "text-amber-700",  bar: "bg-amber-400" },
  { label: "Scaling",    min: 21, max: 30, bg: "bg-blue-100",   text: "text-blue-700",   bar: "bg-blue-400" },
  { label: "Mastery",    min: 31, max: 40, bg: "bg-green-100",  text: "text-green-700",  bar: "bg-green-500" },
] as const;

export function getMaturityLevel(total: number) {
  if (total <= 10) return MATURITY_LEVELS[0];
  if (total <= 20) return MATURITY_LEVELS[1];
  if (total <= 30) return MATURITY_LEVELS[2];
  return MATURITY_LEVELS[3];
}

export function calcTotal(scores: Record<HabitKey, number>): number {
  return HABIT_KEYS.reduce((sum, k) => sum + (scores[k] ?? 0), 0);
}

const habitScoreFields = Object.fromEntries(
  HABIT_KEYS.map((k) => [k, z.number().int().min(0).max(4)])
) as Record<HabitKey, z.ZodNumber>;

export const createHabitAssessmentSchema = z.object({
  quarter: z.string().min(1),
  year: z.number().int().min(2020).max(2035),
  assessmentDate: z.string().optional(),
  notes: z.string().optional().nullable(),
  ...habitScoreFields,
});

export const updateHabitAssessmentSchema = createHabitAssessmentSchema.partial();

export type CreateHabitAssessmentInput = z.infer<typeof createHabitAssessmentSchema>;
export type UpdateHabitAssessmentInput = z.infer<typeof updateHabitAssessmentSchema>;

// ---------------------------------------------------------------------------
// Multi-user campaign model (admin launches → members fill → aggregate)
// ---------------------------------------------------------------------------

export const HABIT_STATUSES = ["draft", "active", "closed"] as const;
export type HabitStatus = (typeof HABIT_STATUSES)[number];

const subItemTuple = z.tuple([z.boolean(), z.boolean(), z.boolean(), z.boolean()]);

export const subItemBitsSchema = z.object(
  Object.fromEntries(HABIT_KEYS.map((k) => [k, subItemTuple])) as Record<HabitKey, typeof subItemTuple>,
);
export type SubItemBits = z.infer<typeof subItemBitsSchema>;

export const launchCampaignSchema = z.object({
  quarter: z.string().regex(/^Q[1-4]$/),
  year: z.number().int().min(2020).max(2035),
  deadline: z.string().datetime().optional(),
  notes: z.string().optional().nullable(),
});
export type LaunchCampaignInput = z.infer<typeof launchCampaignSchema>;

export const updateCampaignSchema = z.object({
  deadline: z.string().datetime().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

export const submitResponseSchema = z.object({
  subItemBits: subItemBitsSchema,
});
export type SubmitResponseInput = z.infer<typeof submitResponseSchema>;

// Aggregation helpers — pure functions, easy to unit-test.

export type SubItemAggregate = {
  index: number;
  label: string;
  yes: number;
  total: number;
  pct: number;
};

export type HabitAggregate = {
  key: HabitKey;
  label: string;
  subItems: SubItemAggregate[];
  pct: number;
  /** Rounded average of the 4 sub-item yes-counts — what the parent row's
   *  COUNT column displays in the checklist table. Derived in `aggregateResponses`
   *  so the UI never has to recompute it. */
  avgYes: number;
};

export type CampaignAggregate = {
  respondentCount: number;
  perHabit: HabitAggregate[];
  overallPct: number;
  habitsAtMax: number;
  totalOutOf40: number;
};

export function aggregateResponses(responses: Array<{ subItemBits: unknown }>): CampaignAggregate {
  const parsed = responses
    .map((r) => {
      const result = subItemBitsSchema.safeParse(r.subItemBits);
      return result.success ? result.data : null;
    })
    .filter((r): r is SubItemBits => r !== null);

  const n = parsed.length;
  const perHabit: HabitAggregate[] = HABIT_KEYS.map((key) => {
    const subItems: SubItemAggregate[] = [0, 1, 2, 3].map((i) => {
      const yes = parsed.reduce((acc, r) => acc + (r[key][i] ? 1 : 0), 0);
      return {
        index: i,
        label: HABIT_DEFINITIONS[key].subItems[i],
        yes,
        total: n,
        pct: n ? yes / n : 0,
      };
    });
    const pct = subItems.reduce((s, x) => s + x.pct, 0) / 4;
    const avgYes = Math.round(subItems.reduce((s, x) => s + x.yes, 0) / 4);
    return { key, label: HABIT_DEFINITIONS[key].label, subItems, pct, avgYes };
  });

  const overallPct = perHabit.reduce((s, h) => s + h.pct, 0) / HABIT_KEYS.length;
  const habitsAtMax = perHabit.filter((h) => h.pct === 1).length;
  const totalOutOf40 = Math.round(overallPct * 40);

  return { respondentCount: n, perHabit, overallPct, habitsAtMax, totalOutOf40 };
}
