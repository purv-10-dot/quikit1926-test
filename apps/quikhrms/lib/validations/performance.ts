import { z } from "zod";

// ─── Goals ──────────────────────────────────────────────

// The public API / UI use the goal type "Team", but the Prisma `GoalType` enum
// stores it as "HrmsTeam" (prefixed to avoid a name clash in the shared central
// schema). Translate at the route boundary so "Team" never reaches Prisma
// (which would reject it with an enum error → 500) and DB reads surface "Team".
type GoalTypeDb = "Individual" | "HrmsTeam" | "Department" | "Organization";
export function goalTypeToDb(t: string): GoalTypeDb;
export function goalTypeToDb(t: string | undefined): GoalTypeDb | undefined;
export function goalTypeToDb(t: string | undefined): GoalTypeDb | undefined {
  return (t === "Team" ? "HrmsTeam" : t) as GoalTypeDb | undefined;
}
export function goalTypeFromDb<T extends { type?: unknown } | null | undefined>(goal: T): T {
  if (goal && (goal as { type?: unknown }).type === "HrmsTeam") {
    (goal as { type: string }).type = "Team";
  }
  return goal;
}

const keyResultSchema = z.object({
  title: z.string().min(1),
  targetValue: z.number().default(0),
  unit: z.string().optional(),
  weight: z.number().min(0, "Weight can’t be negative").max(100, "Weight can’t exceed 100%").default(0),
});

export const createGoalSchema = z.object({
  employeeId: z.string().optional(),
  parentGoalId: z.string().optional(),
  title: z.string().min(1, "Title required"),
  description: z.string().optional(),
  type: z.enum(["Individual", "Team", "Department", "Organization"]).default("Individual"),
  category: z.enum(["Business", "Development", "Behavioral", "Project"]).default("Business"),
  metric: z.string().optional(),
  targetValue: z.number().default(0),
  unit: z.string().optional(),
  weight: z.number().min(0, "Weight can’t be negative").max(100, "Weight can’t exceed 100%").default(0),
  startDate: z.string().min(1),
  dueDate: z.string().min(1),
  alignedTo: z.string().optional(),
  visibility: z.enum(["Private", "TeamVisible", "DepartmentVisible", "OrganizationVisible"]).default("TeamVisible"),
  keyResults: z.array(keyResultSchema).optional(),
}).refine(
  (d) => d.dueDate >= d.startDate,
  { message: "Due date must be on or after the start date", path: ["dueDate"] },
);

export const updateGoalSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  currentValue: z.number().optional(),
  progress: z.number().min(0).max(100).optional(),
  status: z.enum(["NotStarted", "InProgress", "AtRisk", "Completed", "Exceeded", "Deferred", "Cancelled"]).optional(),
  weight: z.number().min(0, "Weight can’t be negative").max(100, "Weight can’t exceed 100%").optional(),
});

export const goalCheckInSchema = z.object({
  currentValue: z.number().min(0, "Value can’t be negative"),
  note: z.string().optional(),
});

// ─── Appraisal Cycles ───────────────────────────────────

const appraisalCycleBase = z.object({
  name: z.string().min(1),
  type: z.enum(["Annual", "BiAnnual", "Quarterly", "Probation", "Confirmation", "PIPReview"]).default("Annual"),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  reviewFormId: z.string().optional(),
  applicableTo: z.object({
    departments: z.array(z.string()).optional(),
    grades: z.array(z.string()).optional(),
    employmentTypes: z.array(z.string()).optional(),
  }).optional(),
  stages: z.array(z.object({
    name: z.string(),
    type: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    isRequired: z.boolean().default(true),
  })).optional(),
});

const appraisalCycleChecks = (
  d: { startDate?: string; endDate?: string; stages?: { name: string; startDate: string; endDate: string }[] },
  ctx: z.RefinementCtx,
) => {
  if (d.startDate && d.endDate && d.endDate < d.startDate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "End date must be on or after the start date", path: ["endDate"] });
  }
  d.stages?.forEach((s, i) => {
    if (s.startDate && s.endDate && s.endDate < s.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Stage "${s.name || i + 1}" end date must be on or after its start date`, path: ["stages", i, "endDate"] });
    }
  });
};

export const createAppraisalCycleSchema = appraisalCycleBase.superRefine(appraisalCycleChecks);

export const updateAppraisalCycleSchema = appraisalCycleBase.partial().superRefine(appraisalCycleChecks);

// ─── Employee Appraisal ─────────────────────────────────

export const updateEmployeeAppraisalSchema = z.object({
  selfRating: z.number().min(0).max(10).optional(),
  selfComments: z.string().optional(),
  selfResponses: z.array(z.unknown()).optional(),
  managerRating: z.number().min(0).max(10).optional(),
  managerComments: z.string().optional(),
  managerResponses: z.array(z.unknown()).optional(),
  calibratedRating: z.number().min(0).max(10).optional(),
  finalRating: z.number().min(0).max(10).optional(),
  finalBand: z.string().optional(),
  promotionRecommendation: z.boolean().optional(),
  salaryRevisionRecommended: z.number().optional(),
  status: z.enum(["Pending", "InProgress", "Submitted", "Completed"]).optional(),
  employeeAcknowledged: z.boolean().optional(),
  employeeFeedback: z.string().optional(),
});

// ─── Review Forms ───────────────────────────────────────

export const createReviewFormSchema = z.object({
  name: z.string().min(1),
  sections: z.array(z.object({
    name: z.string().min(1),
    weight: z.number().default(0),
    type: z.enum(["Goals", "Competencies", "Values", "CustomQuestions"]),
    questions: z.array(z.object({
      text: z.string().min(1),
      type: z.enum(["Rating", "Text", "MultiChoice", "Scale"]),
      ratingScale: z.object({ min: z.number(), max: z.number(), labels: z.array(z.string()) })
        .refine((r) => r.max > r.min, { message: "Rating scale max must be greater than min", path: ["max"] })
        .optional(),
      isRequired: z.boolean().default(true),
    })),
  })).min(1),
});

export const updateReviewFormSchema = createReviewFormSchema.partial();

// ─── Continuous Feedback ────────────────────────────────

export const createFeedbackSchema = z.object({
  toEmployeeId: z.string().min(1),
  type: z.enum(["Praise", "Constructive", "Suggestion", "Recognition"]).default("Praise"),
  category: z.enum(["Teamwork", "Leadership", "Technical", "Communication", "Innovation", "CustomerFocus"]).default("Teamwork"),
  message: z.string().min(1, "Message required"),
  isPublic: z.boolean().default(false),
  badges: z.array(z.string()).optional(),
  relatedGoalId: z.string().optional(),
});


// ─── PIP ────────────────────────────────────────────────

export const createPIPSchema = z.object({
  employeeId: z.string().min(1),
  reason: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  objectives: z.array(z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    targetDate: z.string().optional(),
    status: z.string().default("Pending"),
  })).optional(),
  supportProvided: z.array(z.string()).optional(),
}).refine(
  (d) => d.endDate >= d.startDate,
  { message: "End date must be on or after the start date", path: ["endDate"] },
);

export const updatePIPSchema = z.object({
  status: z.enum(["PIPActive", "PIPExtended", "PIPCompletedSuccess", "PIPFailed", "PIPWithdrawn"]).optional(),
  outcome: z.enum(["Improved", "Terminated", "Extended", "Probation"]).optional(),
  objectives: z.array(z.unknown()).optional(),
  endDate: z.string().optional(),
});

// ─── KRA / KPI Templates ─────────────────────────────────────────────

const weight = z.number().min(0).max(100);

export const kpiEntrySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  measurementMethod: z.string().max(500).optional().nullable(),
  target: z.string().max(200).optional().nullable(),
  unit: z.string().max(40).optional().nullable(),
  weight,
  sortOrder: z.number().int().min(0).default(0),
});

export const kraEntrySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  weight,
  sortOrder: z.number().int().min(0).default(0),
  kpis: z.array(kpiEntrySchema).min(1, "At least one KPI per KRA"),
}).refine(
  (k) => Math.abs(k.kpis.reduce((s, p) => s + p.weight, 0) - 100) < 0.01,
  { message: "KPI weights within a KRA must sum to 100", path: ["kpis"] },
);

export const createKraScorecardSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  designationId: z.string().optional().nullable(),
  // Department is REQUIRED — it controls which employees show up on the
  // Assign modal. Without it, HR could assign a scorecard to anyone, defeating
  // the team-scoped design.
  departmentId: z.string().min(1, "Department is required"),
  tags: z.array(z.string()).optional(),
  effectiveFrom: z.string().min(1, "Effective from required"),
  isActive: z.boolean().default(true),
  kras: z.array(kraEntrySchema).min(1, "At least one KRA"),
}).refine(
  (s) => Math.abs(s.kras.reduce((sum, k) => sum + k.weight, 0) - 100) < 0.01,
  { message: "KRA weights must sum to 100", path: ["kras"] },
);

// .partial() can't be used on schemas with .refine() in Zod 4, so define
// the update schema explicitly. Refinements only run when `kras` is provided.
export const updateKraScorecardSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  designationId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  effectiveFrom: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  kras: z.array(kraEntrySchema).min(1).optional(),
}).refine(
  (s) => !s.kras || Math.abs(s.kras.reduce((sum, k) => sum + k.weight, 0) - 100) < 0.01,
  { message: "KRA weights must sum to 100", path: ["kras"] },
);

export const assignKraSchema = z.object({
  scorecardId: z.string().min(1),
  employeeIds: z.array(z.string()).min(1).max(500),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().optional().nullable(),
  cycleId: z.string().optional().nullable(),
});

// Update progress for one or more KPIs on an assignment.
// Keyed by KPI id (the KpiTemplateEntry.id frozen into the snapshot).
export const kpiProgressEntrySchema = z.object({
  currentValue: z.string().max(200).optional().nullable(),
  score: z.number().min(0).max(5).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
export const updateKraAssignmentProgressSchema = z.object({
  progress: z.record(z.string(), kpiProgressEntrySchema),
});
export const updateKraAssignmentStatusSchema = z.object({
  status: z.enum(["Active", "Completed", "Cancelled"]),
});

export type CreateKraScorecardInput = z.infer<typeof createKraScorecardSchema>;
export type KraEntryInput = z.infer<typeof kraEntrySchema>;
export type KpiEntryInput = z.infer<typeof kpiEntrySchema>;
