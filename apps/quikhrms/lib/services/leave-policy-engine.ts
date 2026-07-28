/**
 * Leave Policy Rule Engine.
 *
 * Deterministic evaluator. Pure(ish): one DB call inside for overlap +
 * monthly/yearly history. No AI. Same input -> same output.
 *
 * Use from POST /leaves/requests AFTER zod parse and BEFORE create.
 */
import { prisma } from "@/lib/prisma";
import type { LeavePolicyRules, LeaveTypeRule, LeaveGlobalRule } from "@/lib/validations/leave";
import { leavePolicyRulesSchema } from "@/lib/validations/leave";
interface CachedPolicy {
  approvedRules: unknown;
  appliesToDeptIds: string[];
  appliesToRoleIds: string[];
  appliesToEmploymentTypes: string[];
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

/**
 * No-op — active leave policies are read directly from Postgres per evaluation
 * (no Redis cache; leave evaluation is low-traffic and the query is orgId-scoped).
 * Kept as a stable hook for the policy-write routes (create/update/approve/extract)
 * so they need no changes.
 */
export async function invalidateLeavePolicyCache(_orgId: string): Promise<void> {
  // nothing cached to invalidate
}

export interface LeaveContext {
  orgId: string;
  employeeId: string;
  startDate: Date;
  endDate: Date;
  duration: number;
  leaveTypeCode: string;
  leaveTypeId: string;
  isPlanned: boolean;
  hasAttachments: boolean;
}

export interface EmployeeMeta {
  gender?: string | null;
  employmentType?: string | null;
  workerType?: string | null;
  dateOfJoining?: Date | null;
  departmentId?: string | null;
  roleId?: string | null;
  maritalStatus?: string | null;
  confirmationDate?: Date | null;
}

export interface Violation {
  code: string;
  message: string;
  severity: "block" | "warn";
  rule?: string;
}

export interface EvaluateResult {
  ok: boolean;
  violations: Violation[];
}

const MS_DAY = 1000 * 60 * 60 * 24;

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / MS_DAY);
}

function startOfDay(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

function findRuleForCode(rules: LeavePolicyRules, code: string): LeaveTypeRule | undefined {
  return rules.leaveTypes.find((r) => r.leaveTypeCode.toUpperCase() === code.toUpperCase());
}

function checkGender(rule: LeaveTypeRule, employee: EmployeeMeta, vios: Violation[]) {
  if (!rule.applicableGender) return;
  const allowed = rule.applicableGender.toLowerCase();
  if (allowed === "all" || allowed === "any") return;
  const empGender = (employee.gender ?? "").toLowerCase();
  if (!empGender || empGender !== allowed) {
    vios.push({
      code: "GENDER_NOT_ELIGIBLE",
      message: `This leave type is restricted to: ${rule.applicableGender}`,
      severity: "block",
      rule: "applicableGender",
    });
  }
}

function checkEmploymentType(rule: LeaveTypeRule, employee: EmployeeMeta, vios: Violation[]) {
  if (!rule.applicableEmploymentType?.length) return;
  const empType = (employee.employmentType ?? "").toLowerCase();
  const allowed = rule.applicableEmploymentType.map((t) => t.toLowerCase());
  if (!allowed.includes(empType)) {
    vios.push({
      code: "EMPLOYMENT_TYPE_NOT_ELIGIBLE",
      message: `This leave type is restricted to: ${rule.applicableEmploymentType.join(", ")}`,
      severity: "block",
      rule: "applicableEmploymentType",
    });
  }
}

function checkProbation(rule: LeaveTypeRule, employee: EmployeeMeta, vios: Violation[]) {
  if (rule.probationBlocked && (employee.workerType ?? "").toLowerCase() === "probation") {
    vios.push({
      code: "PROBATION_BLOCKED",
      message: "Employees on probation are not eligible for this leave type",
      severity: "block",
      rule: "probationBlocked",
    });
  }
}

function checkTenure(rule: LeaveTypeRule, employee: EmployeeMeta, ctx: LeaveContext, vios: Violation[]) {
  if (rule.applicableAfterDays == null) return;
  if (!employee.dateOfJoining) return;
  const tenureDays = daysBetween(startOfDay(employee.dateOfJoining), startOfDay(ctx.startDate));
  if (tenureDays < rule.applicableAfterDays) {
    vios.push({
      code: "TENURE_TOO_SHORT",
      message: `Requires ${rule.applicableAfterDays} days of service. Current tenure: ${tenureDays} days.`,
      severity: "block",
      rule: "applicableAfterDays",
    });
  }
}

function checkConsecutive(rule: LeaveTypeRule, ctx: LeaveContext, vios: Violation[]) {
  if (rule.minConsecutiveDays != null && ctx.duration < rule.minConsecutiveDays) {
    vios.push({
      code: "BELOW_MIN_CONSECUTIVE",
      message: `Minimum ${rule.minConsecutiveDays} consecutive days required. Requested: ${ctx.duration}.`,
      severity: "block",
      rule: "minConsecutiveDays",
    });
  }
  if (rule.maxConsecutiveDays != null && ctx.duration > rule.maxConsecutiveDays) {
    vios.push({
      code: "ABOVE_MAX_CONSECUTIVE",
      message: `Maximum ${rule.maxConsecutiveDays} consecutive days allowed. Requested: ${ctx.duration}.`,
      severity: "block",
      rule: "maxConsecutiveDays",
    });
  }
}

function checkNotice(rule: LeaveTypeRule, ctx: LeaveContext, vios: Violation[]) {
  if (rule.advanceNoticeDays == null) return;
  if (!ctx.isPlanned) return;
  const today = startOfDay(new Date());
  const noticeGiven = daysBetween(today, startOfDay(ctx.startDate));
  if (noticeGiven < rule.advanceNoticeDays) {
    vios.push({
      code: "INSUFFICIENT_NOTICE",
      message: `Requires ${rule.advanceNoticeDays} days advance notice. Given: ${noticeGiven} days.`,
      severity: "block",
      rule: "advanceNoticeDays",
    });
  }
}

function checkDocumentation(rule: LeaveTypeRule, ctx: LeaveContext, vios: Violation[]) {
  if (!rule.requiresDocumentation) return;
  const threshold = rule.documentationAfterDays ?? 0;
  if (ctx.duration > threshold && !ctx.hasAttachments) {
    vios.push({
      code: "DOCUMENTATION_REQUIRED",
      message: `Supporting documentation is required for leaves longer than ${threshold} day(s).`,
      severity: "block",
      rule: "requiresDocumentation",
    });
  }
}

function checkBlackout(global: LeaveGlobalRule | undefined, ctx: LeaveContext, vios: Violation[]) {
  if (!global) return;
  const startMs = startOfDay(ctx.startDate).getTime();
  const endMs = startOfDay(ctx.endDate).getTime();

  if (global.blackoutDates?.length) {
    for (const d of global.blackoutDates) {
      const t = startOfDay(new Date(d)).getTime();
      if (!isNaN(t) && t >= startMs && t <= endMs) {
        vios.push({
          code: "BLACKOUT_DATE",
          message: `Leave overlaps with company blackout date: ${d}`,
          severity: "block",
          rule: "blackoutDates",
        });
        break;
      }
    }
  }

  if (global.blackoutDateRanges?.length) {
    for (const r of global.blackoutDateRanges) {
      const from = startOfDay(new Date(r.from)).getTime();
      const to = startOfDay(new Date(r.to)).getTime();
      if (isNaN(from) || isNaN(to)) continue;
      if (startMs <= to && endMs >= from) {
        vios.push({
          code: "BLACKOUT_RANGE",
          message: `Leave overlaps with blackout period (${r.from} to ${r.to})${r.reason ? `: ${r.reason}` : ""}`,
          severity: "block",
          rule: "blackoutDateRanges",
        });
        break;
      }
    }
  }
}

async function checkOverlap(ctx: LeaveContext, vios: Violation[]) {
  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      orgId: ctx.orgId,
      employeeId: ctx.employeeId,
      deletedAt: null,
      status: { in: ["Pending", "Approved"] },
      startDate: { lte: ctx.endDate },
      endDate: { gte: ctx.startDate },
    },
    select: { id: true, startDate: true, endDate: true, status: true },
  });
  if (overlap) {
    vios.push({
      code: "OVERLAPPING_REQUEST",
      message: `You already have a ${overlap.status.toLowerCase()} leave request overlapping these dates.`,
      severity: "block",
    });
  }
}

async function checkMonthlyYearlyCaps(rule: LeaveTypeRule, ctx: LeaveContext, vios: Violation[]) {
  if (rule.maxPerMonth == null && rule.maxPerYear == null) return;

  const year = ctx.startDate.getUTCFullYear();
  const month = ctx.startDate.getUTCMonth();

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));

  const sameTypeApproved = await prisma.leaveRequest.findMany({
    where: {
      orgId: ctx.orgId,
      employeeId: ctx.employeeId,
      leaveTypeId: ctx.leaveTypeId,
      deletedAt: null,
      status: { in: ["Pending", "Approved"] },
      startDate: { gte: yearStart, lte: yearEnd },
    },
    select: { startDate: true, duration: true },
  });

  if (rule.maxPerMonth != null) {
    const monthUsed = sameTypeApproved
      .filter((r) => r.startDate >= monthStart && r.startDate <= monthEnd)
      .reduce((s, r) => s + Number(r.duration), 0);
    if (monthUsed + ctx.duration > rule.maxPerMonth) {
      vios.push({
        code: "EXCEEDS_MONTHLY_CAP",
        message: `Max ${rule.maxPerMonth} day(s) per month allowed. Already used: ${monthUsed}.`,
        severity: "block",
        rule: "maxPerMonth",
      });
    }
  }

  if (rule.maxPerYear != null) {
    const yearUsed = sameTypeApproved.reduce((s, r) => s + Number(r.duration), 0);
    if (yearUsed + ctx.duration > rule.maxPerYear) {
      vios.push({
        code: "EXCEEDS_YEARLY_CAP",
        message: `Max ${rule.maxPerYear} day(s) per year allowed. Already used: ${yearUsed}.`,
        severity: "block",
        rule: "maxPerYear",
      });
    }
  }
}

async function checkClubbing(rule: LeaveTypeRule, ctx: LeaveContext, vios: Violation[]) {
  if (!rule.clubbingBlockedWith?.length) return;

  const blockedTypes = await prisma.leaveType.findMany({
    where: {
      orgId: ctx.orgId,
      deletedAt: null,
      code: { in: rule.clubbingBlockedWith.map((c) => c.toUpperCase()) },
    },
    select: { id: true, code: true },
  });
  if (!blockedTypes.length) return;

  const adjacentWindow = 1;
  const windowStart = new Date(ctx.startDate);
  windowStart.setDate(windowStart.getDate() - adjacentWindow);
  const windowEnd = new Date(ctx.endDate);
  windowEnd.setDate(windowEnd.getDate() + adjacentWindow);

  const clashing = await prisma.leaveRequest.findFirst({
    where: {
      orgId: ctx.orgId,
      employeeId: ctx.employeeId,
      deletedAt: null,
      status: { in: ["Pending", "Approved"] },
      leaveTypeId: { in: blockedTypes.map((t) => t.id) },
      startDate: { lte: windowEnd },
      endDate: { gte: windowStart },
    },
    select: { id: true, leaveTypeId: true },
  });
  if (clashing) {
    const code = blockedTypes.find((t) => t.id === clashing.leaveTypeId)?.code ?? "";
    vios.push({
      code: "CLUBBING_BLOCKED",
      message: `This leave type cannot be clubbed adjacent to: ${code}`,
      severity: "block",
      rule: "clubbingBlockedWith",
    });
  }
}

async function checkBalance(rule: LeaveTypeRule, ctx: LeaveContext, vios: Violation[]) {
  const year = ctx.startDate.getUTCFullYear();
  const [balance, leaveType] = await Promise.all([
    prisma.leaveBalance.findFirst({
      where: {
        orgId: ctx.orgId,
        employeeId: ctx.employeeId,
        leaveTypeId: ctx.leaveTypeId,
        year,
        deletedAt: null,
      },
      select: { accrued: true, taken: true, adjusted: true, carriedForward: true, encashed: true, lapsed: true },
    }),
    prisma.leaveType.findFirst({
      where: { id: ctx.leaveTypeId, orgId: ctx.orgId, deletedAt: null },
      select: { maxBalance: true },
    }),
  ]);

  // LeaveType.maxBalance is the source-of-truth opening entitlement — the same
  // value the /leaves/balances endpoint and the Apply-Leave balance cards show.
  // A missing balance row only means no accruals/usage are recorded yet; the
  // entitlement still applies, so we must NOT hard-block as "nothing allocated"
  // when the type actually grants days (that mismatch is the bug being fixed).
  const opening = Number(leaveType?.maxBalance ?? 0);

  if (!balance && opening <= 0) {
    if (!rule.isNegativeBalanceAllowed) {
      vios.push({
        code: "NO_BALANCE",
        message: "No leave balance is allocated for this leave type for the current year.",
        severity: "block",
      });
    }
    return;
  }

  const available = opening + Number(balance?.accrued ?? 0) + Number(balance?.carriedForward ?? 0)
    + Number(balance?.adjusted ?? 0) - Number(balance?.taken ?? 0) - Number(balance?.encashed ?? 0) - Number(balance?.lapsed ?? 0);

  const remainingAfter = available - ctx.duration;
  if (remainingAfter < 0) {
    if (!rule.isNegativeBalanceAllowed) {
      vios.push({
        code: "INSUFFICIENT_BALANCE",
        message: `Available balance: ${available} day(s). Requested: ${ctx.duration}.`,
        severity: "block",
      });
    } else if (rule.maxNegativeBalance != null && Math.abs(remainingAfter) > rule.maxNegativeBalance) {
      vios.push({
        code: "EXCEEDS_MAX_NEGATIVE_BALANCE",
        message: `Max negative balance is ${rule.maxNegativeBalance} day(s). Would go to ${remainingAfter}.`,
        severity: "block",
      });
    }
  }
}

/**
 * Rules configured directly on the LeaveType row (independent of the AI-extracted
 * policy JSON), so they apply even when no LeavePolicy document exists:
 *   • marital-status eligibility
 *   • waiting period anchored to Joining OR Confirmation date
 *   • max leave DAYS of this type per calendar month
 *   • minimum gap between two leaves of this type
 */
export async function evaluateLeaveTypeColumns(params: {
  ctx: LeaveContext;
  employee: EmployeeMeta;
  /**
   * Per-group rule overrides (from the employee's Leave Group). When present,
   * these replace the corresponding LeaveType column so a leave type can carry
   * different day/gap/waiting-period rules in different groups.
   */
  overrides?: {
    applicableAfterDays?: number | null;
    applicableAfterRef?: string | null;
    maxDaysPerMonth?: number | null;
    minGapDays?: number | null;
  } | null;
}): Promise<EvaluateResult> {
  const { ctx, employee, overrides } = params;
  const vios: Violation[] = [];

  const base = await prisma.leaveType.findFirst({
    where: { id: ctx.leaveTypeId, orgId: ctx.orgId, deletedAt: null },
    select: {
      name: true, applicableMaritalStatus: true, applicableAfterDays: true,
      applicableAfterRef: true, maxDaysPerMonth: true, minGapDays: true,
    },
  });
  if (!base) return { ok: true, violations: vios };

  // Group rules win over the LeaveType column when the key is present.
  const has = (k: keyof NonNullable<typeof overrides>) => overrides != null && k in overrides;
  const lt = {
    name: base.name,
    applicableMaritalStatus: base.applicableMaritalStatus,
    applicableAfterDays: has("applicableAfterDays") ? overrides!.applicableAfterDays ?? null : base.applicableAfterDays,
    applicableAfterRef: has("applicableAfterRef") ? overrides!.applicableAfterRef ?? null : base.applicableAfterRef,
    maxDaysPerMonth: has("maxDaysPerMonth") ? overrides!.maxDaysPerMonth ?? null : base.maxDaysPerMonth,
    minGapDays: has("minGapDays") ? overrides!.minGapDays ?? null : base.minGapDays,
  };

  // 1. Marital-status eligibility
  const marital = (lt.applicableMaritalStatus ?? "").toLowerCase();
  if (marital && marital !== "all" && marital !== "any") {
    if ((employee.maritalStatus ?? "").toLowerCase() !== marital) {
      vios.push({
        code: "MARITAL_NOT_ELIGIBLE",
        message: `${lt.name} is available only to ${lt.applicableMaritalStatus} employees.`,
        severity: "block", rule: "applicableMaritalStatus",
      });
    }
  }

  // 2. Waiting period from the configured anchor (joining or confirmation date)
  if (lt.applicableAfterDays && lt.applicableAfterDays > 0) {
    const useConfirm = lt.applicableAfterRef === "ConfirmationDate";
    const anchor = useConfirm ? employee.confirmationDate : employee.dateOfJoining;
    if (useConfirm && !anchor) {
      vios.push({
        code: "NOT_CONFIRMED",
        message: `${lt.name} is available only after your employment is confirmed.`,
        severity: "block", rule: "applicableAfterRef",
      });
    } else if (anchor) {
      const tenure = daysBetween(startOfDay(anchor), startOfDay(ctx.startDate));
      if (tenure < lt.applicableAfterDays) {
        vios.push({
          code: "TENURE_TOO_SHORT",
          message: `${lt.name} requires ${lt.applicableAfterDays} day(s) after ${useConfirm ? "confirmation" : "joining"}. So far: ${tenure} day(s).`,
          severity: "block", rule: "applicableAfterDays",
        });
      }
    }
  }

  // 3. Max leave DAYS of this type in the request's calendar month
  if (lt.maxDaysPerMonth != null) {
    const y = ctx.startDate.getUTCFullYear();
    const m = ctx.startDate.getUTCMonth();
    const rows = await prisma.leaveRequest.findMany({
      where: {
        orgId: ctx.orgId, employeeId: ctx.employeeId, leaveTypeId: ctx.leaveTypeId,
        deletedAt: null, status: { in: ["Pending", "Approved"] },
        startDate: { gte: new Date(Date.UTC(y, m, 1)), lte: new Date(Date.UTC(y, m + 1, 0, 23, 59, 59)) },
      },
      select: { duration: true },
    });
    const used = rows.reduce((s, r) => s + Number(r.duration), 0);
    if (used + ctx.duration > lt.maxDaysPerMonth) {
      vios.push({
        code: "EXCEEDS_MONTHLY_DAYS",
        message: `Max ${lt.maxDaysPerMonth} ${lt.name} day(s) per month. Already used: ${used}.`,
        severity: "block", rule: "maxDaysPerMonth",
      });
    }
  }

  // 4. Minimum gap between two leaves of this type
  if (lt.minGapDays && lt.minGapDays > 0) {
    const gapMs = lt.minGapDays * MS_DAY;
    const sStart = startOfDay(ctx.startDate);
    const sEnd = startOfDay(ctx.endDate);
    const clash = await prisma.leaveRequest.findFirst({
      where: {
        orgId: ctx.orgId, employeeId: ctx.employeeId, leaveTypeId: ctx.leaveTypeId,
        deletedAt: null, status: { in: ["Pending", "Approved"] },
        OR: [
          { endDate: { gte: new Date(sStart.getTime() - gapMs), lt: sStart } },
          { startDate: { gt: sEnd, lte: new Date(sEnd.getTime() + gapMs) } },
        ],
      },
      select: { id: true },
    });
    if (clash) {
      vios.push({
        code: "MIN_GAP_VIOLATION",
        message: `Keep at least ${lt.minGapDays} day(s) between two ${lt.name} leaves.`,
        severity: "block", rule: "minGapDays",
      });
    }
  }

  const blocking = vios.filter((v) => v.severity === "block");
  return { ok: blocking.length === 0, violations: vios };
}

export function parseRules(json: unknown): LeavePolicyRules | null {
  if (!json) return null;
  const parsed = leavePolicyRulesSchema.safeParse(json);
  if (!parsed.success) return null;
  return parsed.data;
}

/**
 * Resolve the Active LeavePolicy for the given tenant + employee.
 * Picks the most recent Active policy matching the employee's department /
 * role / employment type filters. Returns null if none.
 */
async function loadCandidatePoliciesFromDb(orgId: string): Promise<CachedPolicy[]> {
  const policies = await prisma.leavePolicy.findMany({
    where: {
      orgId,
      status: "Active",
      deletedAt: null,
    },
    orderBy: [{ effectiveFrom: "desc" }, { updatedAt: "desc" }],
    select: {
      approvedRules: true,
      appliesToDeptIds: true,
      appliesToRoleIds: true,
      appliesToEmploymentTypes: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
  });

  return policies.map((p) => ({
    approvedRules: p.approvedRules,
    appliesToDeptIds: (p.appliesToDeptIds as string[] | null) ?? [],
    appliesToRoleIds: (p.appliesToRoleIds as string[] | null) ?? [],
    appliesToEmploymentTypes: (p.appliesToEmploymentTypes as string[] | null) ?? [],
    effectiveFrom: p.effectiveFrom ? p.effectiveFrom.toISOString() : null,
    effectiveTo: p.effectiveTo ? p.effectiveTo.toISOString() : null,
  }));
}

export async function resolveActivePolicyRules(params: {
  orgId: string;
  employee: EmployeeMeta;
}): Promise<LeavePolicyRules | null> {
  // Read live from Postgres — no Redis cache (low-traffic, orgId-scoped query).
  const policies = await loadCandidatePoliciesFromDb(params.orgId);

  const today = Date.now();
  const { employee } = params;

  for (const p of policies) {
    const from = p.effectiveFrom ? new Date(p.effectiveFrom).getTime() : null;
    const to = p.effectiveTo ? new Date(p.effectiveTo).getTime() : null;
    if (from && from > today) continue;
    if (to && to < today) continue;

    if (p.appliesToDeptIds.length && !(employee.departmentId && p.appliesToDeptIds.includes(employee.departmentId))) continue;
    if (p.appliesToRoleIds.length && !(employee.roleId && p.appliesToRoleIds.includes(employee.roleId))) continue;
    if (p.appliesToEmploymentTypes.length && !(employee.employmentType && p.appliesToEmploymentTypes.includes(employee.employmentType))) continue;

    const rules = parseRules(p.approvedRules);
    if (rules) return rules;
  }
  return null;
}

export async function evaluateLeavePolicy(params: {
  ctx: LeaveContext;
  employee: EmployeeMeta;
  rules: LeavePolicyRules;
}): Promise<EvaluateResult> {
  const { ctx, employee, rules } = params;
  const vios: Violation[] = [];

  const rule = findRuleForCode(rules, ctx.leaveTypeCode);

  if (rule) {
    checkGender(rule, employee, vios);
    checkEmploymentType(rule, employee, vios);
    checkProbation(rule, employee, vios);
    checkTenure(rule, employee, ctx, vios);
    checkConsecutive(rule, ctx, vios);
    checkNotice(rule, ctx, vios);
    checkDocumentation(rule, ctx, vios);
    await checkMonthlyYearlyCaps(rule, ctx, vios);
    await checkClubbing(rule, ctx, vios);
    await checkBalance(rule, ctx, vios);
  }

  checkBlackout(rules.global, ctx, vios);
  await checkOverlap(ctx, vios);

  const blocking = vios.filter((v) => v.severity === "block");
  return { ok: blocking.length === 0, violations: vios };
}
