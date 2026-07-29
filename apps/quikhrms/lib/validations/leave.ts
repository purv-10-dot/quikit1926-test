import { z } from "zod";

// ─── Leave Type ─────────────────────────────────────────

export const createLeaveTypeSchema = z.object({
  name: z.string().min(1, "Name required"),
  code: z.string().min(1, "Code required"),
  color: z.string().optional(),
  description: z.string().nullable().optional(),
  applicableMaritalStatus: z.string().nullable().optional(), // All|Single|Married
  isPaid: z.boolean().default(true),
  isCarryForward: z.boolean().default(false),
  maxCarryForward: z.number().int().nullable().optional(),
  isEncashable: z.boolean().default(false),
  maxEncashment: z.number().int().nullable().optional(),
  accrualType: z.enum(["Monthly", "Quarterly", "Yearly", "Upfront"]).default("Yearly"),
  accrualCount: z.number().default(0),
  maxBalance: z.number().int().default(0),
  minConsecutiveDays: z.number().int().nullable().optional(),
  maxConsecutiveDays: z.number().int().nullable().optional(),
  maxPerMonth: z.number().int().nullable().optional(),
  maxPerYear: z.number().int().nullable().optional(),
  isOnceInLifetime: z.boolean().default(false),
  applicableGender: z.string().optional(),
  applicableEmploymentType: z.array(z.string()).optional(),
  applicableAfterDays: z.number().int().default(0),
  requiresDocumentation: z.boolean().default(false),
  documentationAfterDays: z.number().int().nullable().optional(),
  documentationType: z.string().max(100).nullable().optional(),
  isNegativeBalanceAllowed: z.boolean().default(false),
  maxNegativeBalance: z.number().int().nullable().optional(),
  includesHolidays: z.boolean().default(false),
  includesWeekoffs: z.boolean().default(false),
  isHalfDayAllowed: z.boolean().default(true),
  isHourlyAllowed: z.boolean().default(false),
  clubbingRestrictions: z.array(z.string()).optional(),
  isCompOff: z.boolean().default(false),
  compOffExpiryDays: z.number().int().optional(),
  isDefault: z.boolean().default(false),
  // ── Leave rules wizard ──
  isUnlimited: z.boolean().optional(),
  noAccrualJoinAfterDay: z.number().int().min(1).max(31).nullable().optional(),
  selfApplyAllowed: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  advanceNoticeDays: z.number().int().min(0).nullable().optional(),
  applicableAfterRef: z.string().nullable().optional(),
  backdateCutoffDay: z.number().int().min(1).max(31).nullable().optional(),
  blockIfBalanceLeaveTypeId: z.string().nullable().optional(),
  requiresComment: z.boolean().optional(),
  maxDaysPerMonth: z.number().int().min(0).nullable().optional(),
  applyCutoffDay: z.number().int().min(1).max(31).nullable().optional(),
  minGapDays: z.number().int().min(0).nullable().optional(),
  blockedDuringNotice: z.boolean().optional(),
});

export const updateLeaveTypeSchema = createLeaveTypeSchema.partial();

// ─── Leave Request ──────────────────────────────────────

const leaveDaySchema = z.object({
  date: z.string(),
  session: z.enum(["FullDay", "FirstHalf", "SecondHalf"]),
  hours: z.number().optional(),
});

export const createLeaveRequestSchema = z.object({
  leaveTypeId: z.string().min(1, "Leave type required"),
  startDate: z.string().min(1, "Start date required"),
  endDate: z.string().min(1, "End date required"),
  duration: z.number().min(0.5).optional(),
  dayBreakdown: z.array(leaveDaySchema).optional(),
  reason: z.string().min(1, "Reason required"),
  attachments: z.array(z.string()).optional(),
  isPlanned: z.boolean().default(true),
}).refine(
  // YYYY-MM-DD strings compare correctly lexicographically.
  (d) => d.endDate >= d.startDate,
  { message: "End date must be on or after the start date", path: ["endDate"] },
);

export const updateLeaveRequestSchema = z.object({
  reason: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  cancelReason: z.string().optional(),
  status: z.enum(["Cancelled", "Recalled"]).optional(),
});

// ─── Leave Approval ─────────────────────────────────────

export const leaveApprovalActionSchema = z.object({
  status: z.enum(["Approved", "Rejected"]),
  comment: z.string().optional(),
});

// ─── Leave Balance Adjustment ───────────────────────────

export const adjustLeaveBalanceSchema = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  year: z.number().int(),
  adjustment: z.number(),
  reason: z.string().min(1, "Reason required"),
});

// ─── Leave Group ────────────────────────────────────────

export const leaveGroupItemSchema = z.object({
  leaveTypeId: z.string().min(1),
  overrideQuota: z.number().nullable().optional(),
  // Per-group rule set (the leave-rules wizard output). Stored as JSON on the
  // group item; shape mirrors the LeaveType rule fields.
  rules: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const createLeaveGroupSchema = z.object({
  name: z.string().min(1, "Group name required"),
  description: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  items: z.array(leaveGroupItemSchema).min(1, "Select at least one leave type"),
});

export const updateLeaveGroupSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  items: z.array(leaveGroupItemSchema).optional(),
});

export const assignLeaveGroupSchema = z.object({
  assignments: z.array(z.object({
    assigneeType: z.enum(["Employee", "Role"]),
    employeeId: z.string().nullable().optional(),
    roleId: z.string().nullable().optional(),
  })).min(1, "Select at least one assignee"),
}).refine(
  (v) => v.assignments.every((a) =>
    (a.assigneeType === "Employee" && a.employeeId) ||
    (a.assigneeType === "Role" && a.roleId)
  ),
  { message: "employeeId or roleId required per assignee type" }
);

export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;
export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type LeaveApprovalAction = z.infer<typeof leaveApprovalActionSchema>;
export type CreateLeaveGroupInput = z.infer<typeof createLeaveGroupSchema>;
export type UpdateLeaveGroupInput = z.infer<typeof updateLeaveGroupSchema>;

// ─── Leave Policy Document (uploaded + AI-parsed) ───────

const ruleNumberOrNull = z.number().nullable().optional();

export const leaveTypeRuleSchema = z.object({
  leaveTypeCode: z.string().min(1),
  leaveTypeName: z.string().optional(),
  minConsecutiveDays: ruleNumberOrNull,
  maxConsecutiveDays: ruleNumberOrNull,
  maxPerMonth: ruleNumberOrNull,
  maxPerYear: ruleNumberOrNull,
  advanceNoticeDays: ruleNumberOrNull,
  applicableAfterDays: ruleNumberOrNull,
  probationBlocked: z.boolean().nullable().optional(),
  requiresDocumentation: z.boolean().nullable().optional(),
  documentationAfterDays: ruleNumberOrNull,
  documentationType: z.string().nullable().optional(),
  isHalfDayAllowed: z.boolean().nullable().optional(),
  includesHolidays: z.boolean().nullable().optional(),
  includesWeekoffs: z.boolean().nullable().optional(),
  sandwichRule: z.boolean().nullable().optional(),
  clubbingBlockedWith: z.array(z.string()).nullable().optional(),
  applicableGender: z.string().nullable().optional(),
  applicableEmploymentType: z.array(z.string()).nullable().optional(),
  isNegativeBalanceAllowed: z.boolean().nullable().optional(),
  maxNegativeBalance: ruleNumberOrNull,
  carryForwardMax: ruleNumberOrNull,
  notes: z.string().nullable().optional(),
});

export const leaveGlobalRuleSchema = z.object({
  maxOpenRequests: ruleNumberOrNull,
  maxOverlapPerTeamPercent: ruleNumberOrNull,
  blackoutDates: z.array(z.string()).nullable().optional(),
  blackoutDateRanges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    reason: z.string().optional(),
  })).nullable().optional(),
  weekendDays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const leavePolicyRulesSchema = z.object({
  // schemaVersion is OUR bookkeeping, not the model's — coerce to 1 regardless
  // of what the extractor returns so a stray value never breaks validation.
  schemaVersion: z.literal(1).default(1).catch(1),
  global: leaveGlobalRuleSchema.optional(),
  leaveTypes: z.array(leaveTypeRuleSchema).default([]),
});

export type LeavePolicyRules = z.infer<typeof leavePolicyRulesSchema>;
export type LeaveTypeRule = z.infer<typeof leaveTypeRuleSchema>;
export type LeaveGlobalRule = z.infer<typeof leaveGlobalRuleSchema>;

// ─── Leave Policy CRUD ──────────────────────────────────

export const createLeavePolicySchema = z.object({
  name: z.string().min(1, "Policy name required"),
  description: z.string().optional(),
  sourceFileUrl: z.string().optional(),
  sourceFileName: z.string().optional(),
  sourceFileType: z.string().optional(),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
  appliesToDeptIds: z.array(z.string()).optional(),
  appliesToRoleIds: z.array(z.string()).optional(),
  appliesToEmploymentTypes: z.array(z.string()).optional(),
});

export const updateLeavePolicySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["Draft", "PendingReview", "Active", "Archived"]).optional(),
  approvedRules: leavePolicyRulesSchema.optional(),
  effectiveFrom: z.string().nullable().optional(),
  effectiveTo: z.string().nullable().optional(),
  appliesToDeptIds: z.array(z.string()).nullable().optional(),
  appliesToRoleIds: z.array(z.string()).nullable().optional(),
  appliesToEmploymentTypes: z.array(z.string()).nullable().optional(),
});

export const approveLeavePolicySchema = z.object({
  approvedRules: leavePolicyRulesSchema,
  effectiveFrom: z.string().optional(),
});

export type CreateLeavePolicyInput = z.infer<typeof createLeavePolicySchema>;
export type UpdateLeavePolicyInput = z.infer<typeof updateLeavePolicySchema>;
export type ApproveLeavePolicyInput = z.infer<typeof approveLeavePolicySchema>;
