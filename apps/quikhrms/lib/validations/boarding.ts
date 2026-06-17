import { z } from "zod";

export const AssigneeRoleEnum = z.enum([
  "ReportingManagerRole", "HRRole", "ITRole", "FinanceRole", "AdminRole", "EmployeeRole", "CustomRole",
]);

export const OnboardingTaskCategoryEnum = z.enum([
  "Documentation", "ItSetup", "Training", "Compliance", "Introduction", "TaskOther",
]);

export const OnboardingTaskStatusEnum = z.enum([
  "TaskPending", "TaskInProgress", "TaskCompleted", "TaskSkipped", "TaskBlocked",
]);

export const OffboardingTaskCategoryEnum = z.enum([
  "AssetReturn", "AccessRevoke", "KnowledgeTransfer", "Clearance",
]);

// ─── Onboarding Templates ───────────────────────────────

export const onboardingTaskTemplateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeRole: AssigneeRoleEnum.default("HRRole"),
  dueInDays: z.number().int().min(0).default(7),
  category: OnboardingTaskCategoryEnum.default("TaskOther"),
  isMandatory: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export const createOnboardingTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  departmentId: z.string().optional().nullable(),
  designationId: z.string().optional().nullable(),
  tasks: z.array(onboardingTaskTemplateSchema).min(1, "At least one task required"),
  isActive: z.boolean().default(true),
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

export const OffboardingReasonEnum = z.enum(["Resignation", "Termination", "Retirement", "ContractEnd"]);

export const offboardingTaskTemplateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeId: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  category: OffboardingTaskCategoryEnum.default("Clearance"),
  sortOrder: z.number().int().default(0),
});

export const initiateOffboardingSchema = z.object({
  employeeId: z.string().min(1),
  resignationDate: z.string().min(1),
  lastWorkingDate: z.string().min(1),
  reason: OffboardingReasonEnum.default("Resignation"),
  notes: z.string().optional(),
  tasks: z.array(offboardingTaskTemplateSchema).optional(),
}).refine(
  (v) => new Date(v.lastWorkingDate) >= new Date(v.resignationDate),
  { path: ["lastWorkingDate"], message: "Last working date cannot be before resignation date" },
);

export const updateOffboardingTaskSchema = updateOnboardingTaskSchema;

export const submitExitInterviewSchema = z.object({
  notes: z.string().min(1),
  rating: z.number().int().min(1).max(5).optional(),
  reasonForLeaving: z.string().optional(),
  wouldRejoin: z.boolean().optional(),
  feedback: z.record(z.string(), z.unknown()).optional(),
});

export type CreateOnboardingTemplateInput = z.infer<typeof createOnboardingTemplateSchema>;
export type InitiateOnboardingInput = z.infer<typeof initiateOnboardingSchema>;
export type InitiateOffboardingInput = z.infer<typeof initiateOffboardingSchema>;
