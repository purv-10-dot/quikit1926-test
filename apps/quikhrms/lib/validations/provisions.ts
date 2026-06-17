import { z } from "zod";

const PROV_CATEGORY = ["ITAccount", "Hardware", "Access", "Compliance", "Facility", "ProvOther"] as const;
const PROV_STATUS = ["ProvPending", "ProvInProgress", "ProvDone", "ProvBlocked", "ProvNotRequired"] as const;
const ASSIGNEE_ROLE = ["ReportingManagerRole", "HRRole", "ITRole", "FinanceRole", "AdminRole", "EmployeeRole", "CustomRole"] as const;

// ─── Provision Catalogue (reusable) ─────────────────────

export const createProvisionItemSchema = z.object({
  name: z.string().min(1, "Name required"),
  category: z.enum(PROV_CATEGORY).default("ProvOther"),
  description: z.string().nullable().optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  departmentIds: z.array(z.string()).optional(),
  roleIds: z.array(z.string()).optional(),
  designationIds: z.array(z.string()).optional(),
  ownerAssigneeRole: z.enum(ASSIGNEE_ROLE).nullable().optional(),
});

export const updateProvisionItemSchema = createProvisionItemSchema.partial();

// ─── Per-employee Provision ─────────────────────────────

export const createEmployeeProvisionSchema = z.object({
  provisionItemId: z.string().nullable().optional(),
  name: z.string().min(1, "Name required"),
  category: z.enum(PROV_CATEGORY).default("ProvOther"),
  status: z.enum(PROV_STATUS).default("ProvPending"),
  assignedTo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const updateEmployeeProvisionSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.enum(PROV_CATEGORY).optional(),
  status: z.enum(PROV_STATUS).optional(),
  assignedTo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  meta: z.record(z.string(), z.unknown()).nullable().optional(),
});

// Apply catalogue → employee (bulk seed based on scope)
export const applyCatalogueSchema = z.object({
  onlyDefaults: z.boolean().default(true),
  itemIds: z.array(z.string()).optional(),
});

// ─── Employment Confirmation ────────────────────────────

export const confirmEmploymentSchema = z.object({
  confirmationDate: z.string().min(1, "Confirmation date required"),
  notes: z.string().nullable().optional(),
  revisedCTC: z.number().positive().nullable().optional(),
  revisedDesignation: z.string().nullable().optional(),
  nextReviewDate: z.string().nullable().optional(),
  sendEmail: z.boolean().default(true),
});

export type CreateProvisionItemInput = z.infer<typeof createProvisionItemSchema>;
export type CreateEmployeeProvisionInput = z.infer<typeof createEmployeeProvisionSchema>;
export type ConfirmEmploymentInput = z.infer<typeof confirmEmploymentSchema>;
