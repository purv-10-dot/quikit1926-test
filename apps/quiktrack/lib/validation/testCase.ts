import { z } from "zod";

/** QuikTest — request validation for the case repository (P1). */

export const testCasePriorityEnum = z.enum([
  "LOWEST",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const testCaseTypeEnum = z.enum([
  "FUNCTIONAL",
  "REGRESSION",
  "UAT",
  "SECURITY",
  "PERFORMANCE",
  "SMOKE",
  "COMPATIBILITY",
  "NEGATIVE",
  "BDD",
  "EXPLORATORY",
]);

export const automationStatusEnum = z.enum(["MANUAL", "AUTOMATED"]);

/**
 * Approval workflow. Draft cases are excluded from run creation by default, so
 * moving a case out of DRAFT is a meaningful act gated by TestCaseApproval:create.
 */
export const approvalStateEnum = z.enum([
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "DEPRECATED",
]);

/**
 * One ordered step. `expected` is optional because exploratory and BDD cases
 * legitimately carry an action with no discrete expected result.
 */
export const testStepSchema = z.object({
  action: z.string().min(1).max(5_000),
  expected: z.string().max(5_000).optional(),
});

/**
 * `automationId` is the CI mapping key and must be unique per project. Trimmed
 * and length-capped here; uniqueness is enforced by a partial unique index and
 * surfaced as a 409.
 */
const automationIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(
    /^[^\s]+$/,
    "automationId cannot contain whitespace — use a form like file.spec.ts::test_name",
  );

/** Tooling when a case is automated. Free text so a team's own harness fits. */
const automationToolSchema = z.string().trim().min(1).max(100);

/** YES | NO | NONE — worth automating later? Distinct from what IS automated. */
export const automationCandidateEnum = z.enum(["YES", "NO", "NONE"]);

/**
 * Free-text ticket references (the spec's "References" field), e.g.
 * "JIRA-3, JIRA-4". Structured requirement linking is QtTestCaseIssueLink;
 * this is for references living in another tracker.
 */
const refTicketsSchema = z.string().trim().max(2_000);

export const createTestCaseSchema = z.object({
  sectionId: z.string().min(1),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).optional(),
  preconditions: z.string().max(50_000).optional(),
  /**
   * Case-level expected outcome — the "Test Case (Text)" template's single
   * Expected Result. Coexists with per-step `steps[].expected`; the template's
   * `kind` decides which the editor shows, and neither is destroyed by
   * switching template.
   */
  expectedResult: z.string().max(50_000).optional(),
  priority: testCasePriorityEnum.default("MEDIUM"),
  type: testCaseTypeEnum.default("FUNCTIONAL"),
  automationStatus: automationStatusEnum.default("MANUAL"),
  automationId: automationIdSchema.optional(),
  automationTool: automationToolSchema.optional(),
  automationCandidate: automationCandidateEnum.optional(),
  refTickets: refTicketsSchema.optional(),
  ownerId: z.string().min(1).optional(),
  estimateMs: z.number().int().min(0).max(86_400_000).optional(),
  templateId: z.string().min(1).optional(),
  steps: z.array(testStepSchema).max(200).default([]),
  tagIds: z.array(z.string().min(1)).max(50).optional(),
});

/**
 * Every field optional. `automationId` and `ownerId` are nullable so the UI can
 * actively CLEAR them — distinct from omitting the key, which leaves them alone.
 * Replacing `steps` replaces the whole ordered list; omitting it leaves the
 * existing steps untouched.
 */
export const updateTestCaseSchema = z.object({
  sectionId: z.string().min(1).optional(),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(50_000).nullable().optional(),
  preconditions: z.string().max(50_000).nullable().optional(),
  expectedResult: z.string().max(50_000).nullable().optional(),
  priority: testCasePriorityEnum.optional(),
  type: testCaseTypeEnum.optional(),
  automationStatus: automationStatusEnum.optional(),
  automationId: automationIdSchema.nullable().optional(),
  automationTool: automationToolSchema.nullable().optional(),
  automationCandidate: automationCandidateEnum.nullable().optional(),
  refTickets: refTicketsSchema.nullable().optional(),
  ownerId: z.string().min(1).nullable().optional(),
  estimateMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
  templateId: z.string().min(1).nullable().optional(),
  steps: z.array(testStepSchema).max(200).optional(),
  tagIds: z.array(z.string().min(1)).max(50).optional(),
});

export const createSuiteSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(255),
  description: z.string().max(10_000).optional(),
});

export const updateSuiteSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(10_000).nullable().optional(),
  archived: z.boolean().optional(),
});

export const createSectionSchema = z.object({
  suiteId: z.string().min(1),
  /**
   * Nullable, not merely optional: a root-level folder is created by sending
   * `parentId: null` explicitly. Accepting only `undefined` here rejected the
   * "Add folder" action with "Expected string, received null".
   */
  parentId: z.string().min(1).nullish(),
  name: z.string().trim().min(1).max(255),
});

/**
 * `parentId: null` moves a section to the suite root. Reparenting is
 * cycle-checked server-side — an adjacency list cannot express that in SQL.
 */
export const updateSectionSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  parentId: z.string().min(1).nullable().optional(),
  orderNo: z.number().int().min(0).max(100_000).optional(),
});

export const approveTestCaseSchema = z.object({
  state: approvalStateEnum,
  note: z.string().max(5_000).optional(),
});

/**
 * Labels (QtTestTag). `projectId` is required on create so a label belongs to a
 * project rather than silently becoming an org-wide one — the unique key is
 * `(orgId, projectId, name)`, and a NULL projectId is a distinct, org-wide slot
 * we do not currently expose.
 *
 * Colour is validated as a 6-digit hex: the value is interpolated into an inline
 * `style` for the chip, so accepting arbitrary text would put unvalidated input
 * into a style attribute.
 */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour, e.g. #2563eb");

export const createTestTagSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(60),
  color: hexColorSchema.optional(),
});

/** Attach an existing label to a case, or create-and-attach by name. */
export const attachTestTagSchema = z
  .object({
    tagId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(60).optional(),
    color: hexColorSchema.optional(),
  })
  .refine((v) => Boolean(v.tagId) !== Boolean(v.name), {
    message: "Provide either an existing tagId or a new label name, not both.",
    path: ["tagId"],
  });

export const listTestCasesSchema = z.object({
  sectionId: z.string().min(1).optional(),
  suiteId: z.string().min(1).optional(),
  query: z.string().trim().max(255).optional(),
  priority: testCasePriorityEnum.optional(),
  type: testCaseTypeEnum.optional(),
  automationStatus: automationStatusEnum.optional(),
  approvalState: approvalStateEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export type CreateTestCaseInput = z.infer<typeof createTestCaseSchema>;
export type UpdateTestCaseInput = z.infer<typeof updateTestCaseSchema>;
export type TestStepInput = z.infer<typeof testStepSchema>;
