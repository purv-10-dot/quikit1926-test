import { z } from "zod";

const AssigneeRoleEnum = z.enum([
  "ReportingManagerRole", "HRRole", "ITRole", "FinanceRole", "AdminRole", "EmployeeRole", "CustomRole",
]);

const OnboardingTaskCategoryEnum = z.enum([
  "Documentation", "ItSetup", "Training", "Compliance", "Introduction", "TaskOther",
]);

const OnboardingTaskStatusEnum = z.enum([
  "TaskPending", "TaskInProgress", "TaskCompleted", "TaskSkipped", "TaskBlocked",
]);

const OffboardingTaskCategoryEnum = z.enum([
  "AssetReturn", "AccessRevoke", "KnowledgeTransfer", "Clearance",
]);

// ─── Onboarding candidate bulk import ───────────────────
// One spreadsheet row. All strings (coerced in the service); only name + official
// email are mandatory. Role / reporting manager / salary can't be set in bulk and
// are completed manually per candidate afterwards.
export const bulkOnboardingRowSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  workEmail: z.string().min(1),
  personalEmail: z.string().optional(),
  personalPhone: z.string().optional(),
  departmentName: z.string().optional(),
  jobTitle: z.string().optional(),
  sourceOfHire: z.string().optional(),
  dateOfJoining: z.string().optional(),
  panNumber: z.string().optional(),
  aadhaarNumber: z.string().optional(),
  uanNumber: z.string().optional(),
  previousExperienceMonths: z.string().optional(),
  highestQualification: z.string().optional(),
  skillSet: z.string().optional(),
});
export type BulkOnboardingRow = z.infer<typeof bulkOnboardingRowSchema>;

const MAX_BULK_ONBOARDING_ROWS = 50;

export const bulkImportOnboardingSchema = z.object({
  fileName: z.string().min(1),
  rows: z.array(bulkOnboardingRowSchema)
    .min(1, "No rows found")
    .max(MAX_BULK_ONBOARDING_ROWS, `Cannot import more than ${MAX_BULK_ONBOARDING_ROWS} candidates at once`),
  dryRun: z.boolean().default(false),
});

// ─── Onboarding Templates ───────────────────────────────

const onboardingTaskTemplateSchema = z.object({
  // Stable per-step identity, generated client-side and carried across edits —
  // lets "Re-apply template" match a step back to an in-progress candidate
  // task instead of only by title. Optional so legacy templates saved before
  // this field existed still validate; the builder backfills one on load.
  id: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  assigneeRole: AssigneeRoleEnum.default("HRRole"),
  dueInDays: z.number().int().min(0).default(7),
  category: OnboardingTaskCategoryEnum.default("TaskOther"),
  isMandatory: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  // Workflow-builder fields (stored in the template's tasks JSON). stepType is
  // the rich type (e.g. SendEmail, Approval); config holds its type-specific
  // settings. category is still derived for task instantiation.
  stepType: z.string().optional(),
  config: z.record(z.any()).optional().nullable(),
  dependencies: z.string().optional().nullable(),
  reminder: z.string().optional().nullable(),
  visibility: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const createOnboardingTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  designationId: z.string().optional().nullable(),
  tasks: z.array(onboardingTaskTemplateSchema).min(1, "At least one task required"),
  isActive: z.boolean().default(true),
});

export const updateOnboardingTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  designationId: z.string().optional().nullable(),
  tasks: z.array(onboardingTaskTemplateSchema).min(1, "At least one task required").optional(),
  isActive: z.boolean().optional(),
});

// ─── Onboarding Instance ────────────────────────────────

export const initiateOnboardingSchema = z.object({
  employeeId: z.string().min(1),
  templateId: z.string().optional().nullable(),
  startDate: z.string().min(1),
  notes: z.string().optional(),
  customTasks: z.array(onboardingTaskTemplateSchema).optional(),
});

export const updateOnboardingTaskSchema = z.object({
  status: OnboardingTaskStatusEnum.optional(),
  notes: z.string().optional(),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

// ─── Offboarding ────────────────────────────────────────

const OffboardingReasonEnum = z.enum(["Resignation", "Termination", "Retirement", "ContractEnd"]);

// ─── Notice Period master ───────────────────────────────

const NoticePeriodUnitEnum = z.enum(["Days", "Weeks", "Months"]);

export const createNoticePeriodSchema = z.object({
  name: z.string().min(1, "Name required"),
  description: z.string().optional(),
  duration: z.number().int().min(0, "Duration must be 0 or more"),
  unit: NoticePeriodUnitEnum.default("Days"),
});

export const updateNoticePeriodSchema = createNoticePeriodSchema.partial();

const offboardingTaskTemplateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeId: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  category: OffboardingTaskCategoryEnum.default("Clearance"),
  sortOrder: z.number().int().default(0),
  // Rich workflow-builder fields (stored in the template's tasks JSON), mirroring
  // onboarding. stepType is the rich type; config holds its type-specific settings.
  stepType: z.string().optional(),
  config: z.record(z.any()).optional().nullable(),
  assigneeRole: z.string().optional(),
  dueInDays: z.number().int().optional(),
  isMandatory: z.boolean().optional(),
});

// ─── Offboarding Templates ──────────────────────────────

export const createOffboardingTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  designationId: z.string().optional().nullable(),
  tasks: z.array(offboardingTaskTemplateSchema).min(1, "At least one task required"),
  isActive: z.boolean().default(true),
});

export const updateOffboardingTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  designationId: z.string().optional().nullable(),
  tasks: z.array(offboardingTaskTemplateSchema).min(1, "At least one task required").optional(),
  isActive: z.boolean().optional(),
});

export const initiateOffboardingSchema = z.object({
  employeeId: z.string().min(1),
  resignationDate: z.string().min(1),
  // Last working date is derived from the chosen notice period, not entered by hand.
  noticePeriodId: z.string().min(1, "Notice period required"),
  reason: OffboardingReasonEnum.default("Resignation"),
  notes: z.string().optional(),
  // Optional offboarding template — its tasks seed the instance's clearance list.
  templateId: z.string().optional().nullable(),
  tasks: z.array(offboardingTaskTemplateSchema).optional(),
});

export const updateOffboardingTaskSchema = updateOnboardingTaskSchema;
