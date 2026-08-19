import { z } from "zod";

/** QuikTest — request validation for runs and result recording (P2). */

export const runSourceEnum = z.enum(["manual", "automated", "mixed"]);
export const runStateEnum = z.enum(["open", "closed"]);

/**
 * A run is built from a whole suite OR an explicit case list. Requiring exactly
 * one of the two is enforced below rather than in the route, so every caller
 * gets the same rule.
 */
export const createTestRunSchema = z
  .object({
    projectId: z.string().min(1),
    name: z.string().trim().min(1).max(255),
    description: z.string().max(10_000).optional(),
    suiteId: z.string().min(1).optional(),
    caseIds: z.array(z.string().min(1)).max(5_000).optional(),
    planId: z.string().min(1).optional(),
    milestoneId: z.string().min(1).optional(),
    configIds: z.array(z.string().min(1)).max(50).optional(),
    source: runSourceEnum.default("manual"),
    build: z.string().trim().max(255).optional(),
    environment: z.string().trim().max(255).optional(),
    assigneeId: z.string().min(1).optional(),
    /**
     * Planned execution window (QUIKTR-320). Both optional — a CI run has no
     * planned dates. Date-only strings from an <input type="date">; the DB also
     * enforces endDate >= startDate.
     */
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    /** Free-text ticket references for the run, e.g. "JIRA-1, JIRA-3". */
    refTickets: z.string().trim().max(2_000).optional(),
    /**
     * Draft cases are excluded by default (the approval workflow's whole
     * point). Set true to include them anyway — useful for a smoke run over
     * work-in-progress cases.
     */
    includeDrafts: z.boolean().default(false),
  })
  .refine((v) => Boolean(v.suiteId) !== Boolean(v.caseIds?.length), {
    message: "Provide either a suiteId or a non-empty caseIds list, not both.",
    path: ["suiteId"],
  })
  // Caught here as well as by the DB CHECK, so the form can show the error on
  // the End date field instead of surfacing a raw constraint violation.
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    message: "End date cannot be before the start date.",
    path: ["endDate"],
  });

/**
 * The manual write path. `statusId` is a QtTestStatus id — the catalogue is
 * org-scoped, so the route verifies it belongs to the caller's org.
 */
export const recordResultSchema = z.object({
  statusId: z.string().min(1),
  comment: z.string().max(50_000).optional(),
  elapsedMs: z.number().int().min(0).max(86_400_000).optional(),
  /** Bug issues this failure raised. */
  defectIssueIds: z.array(z.string().min(1)).max(50).optional(),
  /** Per-step outcomes, keyed by the case's step ids. */
  stepResults: z
    .array(
      z.object({
        stepId: z.string().min(1),
        statusId: z.string().min(1),
        comment: z.string().max(10_000).optional(),
      }),
    )
    .max(200)
    .optional(),
  attachments: z
    .array(
      z.object({
        fileName: z.string().min(1).max(500),
        mimeType: z.string().min(1).max(255),
        sizeBytes: z.number().int().min(0),
        s3Key: z.string().min(1).max(1_000),
      }),
    )
    .max(20)
    .optional(),
});

export const listRunsSchema = z.object({
  projectId: z.string().min(1).optional(),
  /** Show soft-deleted runs instead of live ones — the "Deleted" view. */
  deleted: z.enum(["true", "false"]).default("false"),
  state: runStateEnum.optional(),
  source: runSourceEnum.optional(),
  milestoneId: z.string().min(1).optional(),
  planId: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const listRunTestsSchema = z.object({
  /** Filter by current status key, e.g. "untested" or "failed". */
  status: z.string().min(1).optional(),
  /** Only tests assigned to the caller. */
  mine: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
});

export const rerunSchema = z.object({
  only: z.enum(["failed", "incomplete", "retest"]).default("failed"),
  name: z.string().trim().min(1).max(255).optional(),
});

export type CreateTestRunInput = z.infer<typeof createTestRunSchema>;
export type RecordResultInput = z.infer<typeof recordResultSchema>;
