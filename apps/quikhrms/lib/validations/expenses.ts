import { z } from "zod";

export const ExpenseCategoryEnum = z.enum([
  "Travel", "Medical", "Food", "Internet", "Phone", "Office", "Training", "Relocation", "Other",
]);

export const ExpenseClaimStatusEnum = z.enum([
  "Draft", "Submitted", "ManagerApproved", "FinanceApproved", "Approved",
  "PartiallyApproved", "Rejected", "Paid", "Cancelled",
]);

// ─── Policies ───────────────────────────────────────────

export const approvalChainLevelSchema = z.object({
  level: z.number().int().min(1),
  approverType: z.enum(["ReportingManager", "DepartmentHead", "HR", "Finance", "Custom"]),
  approverId: z.string().optional(),
  maxAmount: z.number().optional(),
});

const expensePolicyBase = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  maxPerTransaction: z.number().min(0).optional().nullable(),
  maxPerMonth: z.number().min(0).optional().nullable(),
  maxPerYear: z.number().min(0).optional().nullable(),
  requiresReceipt: z.boolean().default(true),
  // Nullable like the Max per*/month/year caps above — the create/edit form
  // sends `null` for a blank field, which used to fail validation outright
  // (z.number().default() only backfills on `undefined`, not `null`).
  receiptThreshold: z.number().min(0).nullable().optional().transform((v) => v ?? 500),
  requiresPreApproval: z.boolean().default(false),
  approvalLevels: z.number().int().min(1).default(1),
  approvalChain: z.array(approvalChainLevelSchema).optional(),
  applicableTo: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().default(true),
});

// Spend caps must be ordered: per-transaction ≤ per-month ≤ per-year.
const policyCapChecks = (
  d: { maxPerTransaction?: number | null; maxPerMonth?: number | null; maxPerYear?: number | null },
  ctx: z.RefinementCtx,
) => {
  if (d.maxPerTransaction != null && d.maxPerMonth != null && d.maxPerTransaction > d.maxPerMonth) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Per-transaction cap can’t exceed the monthly cap", path: ["maxPerTransaction"] });
  }
  if (d.maxPerMonth != null && d.maxPerYear != null && d.maxPerMonth > d.maxPerYear) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Monthly cap can’t exceed the yearly cap", path: ["maxPerMonth"] });
  }
};

export const createExpensePolicySchema = expensePolicyBase.superRefine(policyCapChecks);

export const updateExpensePolicySchema = expensePolicyBase.partial().superRefine(policyCapChecks);

// ─── Claims ─────────────────────────────────────────────

export const createExpenseClaimSchema = z.object({
  policyId: z.string().min(1, "Policy is required"),
  category: ExpenseCategoryEnum,
  title: z.string().min(1),
  description: z.string().optional(),
  totalAmount: z.number().positive("Amount must be greater than 0").max(10_000_000, "Amount is unrealistically large"),
  currency: z.string().length(3).default("INR"),
  expenseDate: z.string().optional().nullable(),
  receiptUrl: z.string().refine(
    (v) => !v || /^https?:\/\//.test(v) || v.startsWith("/"),
    { message: "Invalid receipt URL" },
  ).optional().nullable(),
  receiptFileType: z.string().optional().nullable(),
});

export const updateExpenseClaimSchema = createExpenseClaimSchema.partial();

// ─── Approval ───────────────────────────────────────────

export const approveClaimSchema = z.object({
  action: z.enum(["ExpApproved", "ExpRejected", "Escalated"]),
  comments: z.string().optional(),
  // NOTE: partial approval is not supported (no approvedAmount column on
  // ExpenseClaim). `approvedAmount` was removed so callers can't believe a
  // partial amount took effect — the full claim amount is what's approved.
});

export type CreateExpensePolicyInput = z.infer<typeof createExpensePolicySchema>;
export type CreateExpenseClaimInput = z.infer<typeof createExpenseClaimSchema>;
