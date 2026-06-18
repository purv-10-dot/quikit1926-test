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

export const createExpensePolicySchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  maxPerTransaction: z.number().min(0).optional().nullable(),
  maxPerMonth: z.number().min(0).optional().nullable(),
  maxPerYear: z.number().min(0).optional().nullable(),
  requiresReceipt: z.boolean().default(true),
  receiptThreshold: z.number().min(0).default(500),
  requiresPreApproval: z.boolean().default(false),
  approvalLevels: z.number().int().min(1).default(1),
  approvalChain: z.array(approvalChainLevelSchema).optional(),
  applicableTo: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().default(true),
});

export const updateExpensePolicySchema = createExpensePolicySchema.partial();

// ─── Claims ─────────────────────────────────────────────

export const createExpenseClaimSchema = z.object({
  policyId: z.string().min(1, "Policy is required"),
  category: ExpenseCategoryEnum,
  title: z.string().min(1),
  description: z.string().optional(),
  totalAmount: z.number().min(0),
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
  approvedAmount: z.number().min(0).optional(),
});

export type CreateExpensePolicyInput = z.infer<typeof createExpensePolicySchema>;
export type CreateExpenseClaimInput = z.infer<typeof createExpenseClaimSchema>;
