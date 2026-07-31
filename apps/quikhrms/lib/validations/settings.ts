import { z } from "zod";
import { PAN_REGEX, TAN_REGEX, GSTIN_REGEX, CIN_REGEX, zPhoneLooseOptional } from "./identifiers";

// Treat "", null, undefined as "not provided" so optional regex fields don't trip.
// Cast preserves inferred string type (preprocess output otherwise typed `unknown`).
function optStr<T extends z.ZodString>(schema: T): z.ZodOptional<T> {
  return z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    schema.optional(),
  ) as unknown as z.ZodOptional<T>;
}

// ─── Company Settings ───────────────────────────────────

export const updateCompanySettingsSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  legalName: z.string().optional().nullable(),
  logo: z.string().optional().nullable().refine(
    (v) => !v || /^https?:\/\//.test(v) || v.startsWith("/"),
    { message: "Must be absolute URL or relative path" },
  ),
  website: z.string().url().optional().nullable().or(z.literal("")),
  email: z.string().min(1, "Company email is required").email("Enter a valid company email"),
  phone: zPhoneLooseOptional.nullable(),
  addressLine1: z.string().min(1, "Address is required"),
  addressLine2: z.string().optional().nullable(),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  country: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  gstin: optStr(z.string().regex(GSTIN_REGEX, "GSTIN format invalid (e.g. 27ABCDE1234F1Z5)")),
  pan:   z.string().min(1, "Company PAN is required").regex(PAN_REGEX, "PAN format invalid (e.g. ABCDE1234F)"),
  cin:   optStr(z.string().regex(CIN_REGEX,   "CIN format invalid (21 chars, e.g. U72200KA2010PTC012345)")),
  tan:   optStr(z.string().regex(TAN_REGEX,   "TAN format invalid (e.g. ABCD12345E)")),
  tdsCircleCodeArea:  optStr(z.string().max(3)),
  tdsCircleCodeType:  optStr(z.string().max(2)),
  tdsCircleNumber:    optStr(z.string().max(3)),
  tdsCircleSubNumber: optStr(z.string().max(2)),
  timezone: z.string().optional(),
  dateFormat: z.string().optional(),
  currency: z.string().length(3).optional(),
  fiscalYearStart: z.number().int().min(1).max(12).optional(),
  probationPeriodDays: z.number().int().min(0).optional(),
  noticePeriodDays: z.number().int().min(0).optional(),
  // Recruit re-apply cooling period, in months (0/null = none).
  candidateCoolingMonths: z.number().int().min(0).max(12).nullable(),
  workWeek: z.array(z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])).optional(),
  workHoursPerDay: z.number().min(1).max(24).optional(),
});

// ─── Holidays ───────────────────────────────────────────

export const CompanyHolidayTypeEnum = z.enum(["National", "Regional", "Company", "Optional"]);

export const createCompanyHolidaySchema = z.object({
  name: z.string().min(1, "Name required"),
  date: z.string().min(1, "Date required"),
  type: CompanyHolidayTypeEnum.default("National"),
  isOptional: z.boolean().default(false),
  maxOptionalAllowed: z.number().int().min(0).optional().nullable(),
  applicableDepartments: z.array(z.string()).optional(),
  applicableLocations: z.array(z.string()).optional(),
  description: z.string().optional(),
  // Client-only options — persisted as side-effects on create, not stored on the row.
  repeatsYearly: z.boolean().optional().default(false),
  repeatYears: z.number().int().min(2).max(10).optional().default(5),
  notifyEmployees: z.boolean().optional().default(false),
});

export const updateCompanyHolidaySchema = createCompanyHolidaySchema.partial();

export const bulkCompanyHolidaySchema = z.object({
  holidays: z.array(createCompanyHolidaySchema).min(1),
});

// ─── Approval Chain ─────────────────────────────────────

export const ApprovalModuleEnum = z.enum([
  "Leave", "Expense", "Asset", "Onboarding", "Offboarding", "Attendance", "Document",
  "Engagement", "Feedback",
  "Reimbursement", "ProofOfInvestment", "SalaryRevision", "OneTimeEarning", "Requisition",
  "WFH", "Payroll",
]);

/**
 * Fully dynamic approver — admin picks either a tenant role (e.g. finance_head)
 * or a specific employee. No hardcoded approver concepts.
 *
 * Legacy approverType ("ReportingManager" etc.) accepted for backward compat
 * on read, but new chains must use kind + roleId/userId.
 */
export const ApproverKindEnum = z.enum(["ROLE", "USER"]);

export const approvalLevelSchema = z.object({
  level: z.number().int().min(1),
  kind: ApproverKindEnum,
  roleId: z.string().optional(),
  userId: z.string().optional(),
  escalateAfterHours: z.number().int().min(1).optional(),
  allowSkip: z.boolean().default(false),
}).refine(
  (v) => (v.kind === "ROLE" ? !!v.roleId : !!v.userId),
  { message: "ROLE kind requires roleId; USER kind requires userId" },
);

export const createApprovalChainSchema = z.object({
  name: z.string().min(1),
  module: ApprovalModuleEnum,
  levels: z.array(approvalLevelSchema).min(1, "At least one approval level required"),
  autoApproveAfterDays: z.number().int().min(1).optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateApprovalChainSchema = createApprovalChainSchema.partial();

export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsSchema>;
export type CreateCompanyHolidayInput = z.infer<typeof createCompanyHolidaySchema>;
export type CreateApprovalChainInput = z.infer<typeof createApprovalChainSchema>;
