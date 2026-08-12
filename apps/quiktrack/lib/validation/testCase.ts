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

export const createTestCaseSchema = z.object({
  sectionId: z.string().min(1),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).optional(),
  preconditions: z.string().max(50_000).optional(),
  priority: testCasePriorityEnum.default("MEDIUM"),
  type: testCaseTypeEnum.default("FUNCTIONAL"),
  automationStatus: automationStatusEnum.default("MANUAL"),
  automationId: automationIdSchema.optional(),
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
  priority: testCasePriorityEnum.optional(),
  type: testCaseTypeEnum.optional(),
  automationStatus: automationStatusEnum.optional(),
  automationId: automationIdSchema.nullable().optional(),
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
