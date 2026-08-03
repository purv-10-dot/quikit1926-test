import { prisma } from "@/lib/prisma";
import { getActiveChainLevels, callerCanActionLevel, getCallerRoleIds, type ChainLevelCfg } from "@/lib/services/approval-chain";
import { findEmployeesWithPermission } from "@/lib/rbac/permission-holders";

export interface PolicySnapshot {
  policyId: string;
  name: string;
  category: string;
  maxPerTransaction: number | null;
  maxPerMonth: number | null;
  maxPerYear: number | null;
  requiresReceipt: boolean;
  receiptThreshold: number;
  requiresPreApproval: boolean;
  approvalLevels: number;
  approvalChain: unknown;
  snapshotAt: string;
}

export async function buildPolicySnapshot(orgId: string, policyId: string): Promise<PolicySnapshot | null> {
  const policy = await prisma.expensePolicy.findFirst({
    where: { id: policyId, orgId, deletedAt: null },
  });
  if (!policy) return null;
  return {
    policyId: policy.id,
    name: policy.name,
    category: policy.category,
    maxPerTransaction: policy.maxPerTransaction != null ? Number(policy.maxPerTransaction) : null,
    maxPerMonth: policy.maxPerMonth != null ? Number(policy.maxPerMonth) : null,
    maxPerYear: policy.maxPerYear != null ? Number(policy.maxPerYear) : null,
    requiresReceipt: policy.requiresReceipt,
    receiptThreshold: Number(policy.receiptThreshold),
    requiresPreApproval: policy.requiresPreApproval,
    approvalLevels: policy.approvalLevels,
    approvalChain: policy.approvalChain ?? null,
    snapshotAt: new Date().toISOString(),
  };
}

export async function validateAgainstSnapshot(
  orgId: string,
  snap: PolicySnapshot,
  employeeId: string,
  amount: number,
  date: Date,
  receiptUrl: string | null,
): Promise<{ ok: boolean; violations: string[] }> {
  const violations: string[] = [];
  if (snap.maxPerTransaction != null && amount > snap.maxPerTransaction) {
    violations.push(`Exceeds per-transaction limit (${snap.maxPerTransaction})`);
  }
  if (snap.requiresReceipt && amount > snap.receiptThreshold && !receiptUrl) {
    violations.push(`Receipt required for amounts above ${snap.receiptThreshold}`);
  }
  if (snap.maxPerMonth != null) {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const monthTotal = await prisma.expenseClaim.aggregate({
      where: {
        orgId, employeeId, policyId: snap.policyId, deletedAt: null,
        status: { in: ["Submitted", "ManagerApproved", "FinanceApproved", "Approved", "Paid"] },
        expenseDate: { gte: monthStart, lte: monthEnd },
      },
      _sum: { totalAmount: true },
    });
    const used = Number(monthTotal._sum.totalAmount ?? 0);
    if (used + amount > snap.maxPerMonth) {
      violations.push(`Exceeds monthly limit (used ${used}, limit ${snap.maxPerMonth})`);
    }
  }
  if (snap.maxPerYear != null) {
    const yearStart = new Date(date.getFullYear(), 0, 1);
    const yearEnd = new Date(date.getFullYear(), 11, 31);
    const yearTotal = await prisma.expenseClaim.aggregate({
      where: {
        orgId, employeeId, policyId: snap.policyId, deletedAt: null,
        status: { in: ["Submitted", "ManagerApproved", "FinanceApproved", "Approved", "Paid"] },
        expenseDate: { gte: yearStart, lte: yearEnd },
      },
      _sum: { totalAmount: true },
    });
    const used = Number(yearTotal._sum.totalAmount ?? 0);
    if (used + amount > snap.maxPerYear) {
      violations.push(`Exceeds yearly limit (used ${used}, limit ${snap.maxPerYear})`);
    }
  }
  return { ok: violations.length === 0, violations };
}

export async function validateAgainstPolicy(
  orgId: string,
  policyId: string,
  employeeId: string,
  amount: number,
  date: Date,
): Promise<{ ok: boolean; violations: string[] }> {
  const policy = await prisma.expensePolicy.findFirst({
    where: { id: policyId, orgId, deletedAt: null, isActive: true },
  });

  if (!policy) return { ok: false, violations: ["Policy not found or inactive"] };

  const violations: string[] = [];

  if (policy.maxPerTransaction && amount > Number(policy.maxPerTransaction)) {
    violations.push(`Exceeds per-transaction limit (${policy.maxPerTransaction})`);
  }

  if (policy.maxPerMonth) {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const monthTotal = await prisma.expenseClaim.aggregate({
      where: {
        orgId, employeeId, policyId, deletedAt: null,
        status: { in: ["Submitted", "ManagerApproved", "FinanceApproved", "Approved", "Paid"] },
        expenseDate: { gte: monthStart, lte: monthEnd },
      },
      _sum: { totalAmount: true },
    });
    const used = Number(monthTotal._sum.totalAmount ?? 0);
    if (used + amount > Number(policy.maxPerMonth)) {
      violations.push(`Exceeds monthly limit (used ${used}, limit ${policy.maxPerMonth})`);
    }
  }

  if (policy.maxPerYear) {
    const yearStart = new Date(date.getFullYear(), 0, 1);
    const yearEnd = new Date(date.getFullYear(), 11, 31);
    const yearTotal = await prisma.expenseClaim.aggregate({
      where: {
        orgId, employeeId, policyId, deletedAt: null,
        status: { in: ["Submitted", "ManagerApproved", "FinanceApproved", "Approved", "Paid"] },
        expenseDate: { gte: yearStart, lte: yearEnd },
      },
      _sum: { totalAmount: true },
    });
    const used = Number(yearTotal._sum.totalAmount ?? 0);
    if (used + amount > Number(policy.maxPerYear)) {
      violations.push(`Exceeds yearly limit (used ${used}, limit ${policy.maxPerYear})`);
    }
  }

  return { ok: violations.length === 0, violations };
}

// ─── Approval-chain eligibility ────────────────────────────────────────
// Shared by the approve route (gate a decision) and the pending-approvals
// listing (count claims awaiting a given approver) so both read the chain the
// same way.

export type ExpenseApproverType = "ReportingManager" | "DepartmentHead" | "HR" | "Finance" | "Custom";

export interface ExpenseChainLevel {
  level: number;
  approverType: ExpenseApproverType;
  approverId?: string;
  maxAmount?: number;
}

export const EXPENSE_APPROVER_LABEL: Record<ExpenseApproverType, string> = {
  ReportingManager: "the employee's reporting manager",
  DepartmentHead: "the department head",
  HR: "an HR admin/manager",
  Finance: "Finance",
  Custom: "the designated approver",
};

/** Does the caller satisfy the approverType required at this chain level? */
export function isEligibleExpenseApprover(
  level: ExpenseChainLevel,
  roles: string[],
  callerEmployeeId: string | null,
  claimInfo: { reportingManagerId: string | null; departmentHeadId: string | null },
): boolean {
  switch (level.approverType) {
    case "ReportingManager":
      return !!callerEmployeeId && callerEmployeeId === claimInfo.reportingManagerId;
    case "DepartmentHead":
      return !!callerEmployeeId && callerEmployeeId === claimInfo.departmentHeadId;
    case "HR":
      return roles.includes("admin");
    case "Finance":
      return roles.includes("admin");
    case "Custom":
      return !!callerEmployeeId && !!level.approverId && callerEmployeeId === level.approverId;
    default:
      return false;
  }
}

/** Claim statuses that can still receive an approval action. */
const ACTIONABLE_CLAIM_STATUSES = ["Submitted", "ManagerApproved", "FinanceApproved"] as const;

/**
 * List the org's expense claims currently awaiting a decision from this caller.
 *
 * Mirrors the gate in the approve route: for each actionable claim we compute the
 * current chain level (approvals so far + 1) and test the caller against that
 * level's `approverType`. Claims with no chain, or no config for the current
 * level, stay permissive (any approver) — matching the route's legacy fallback.
 * super_admin sees every actionable claim.
 */
export interface ClaimRequester {
  id: string;
  firstName: string;
  lastName: string;
  profilePhoto: string | null;
}

export async function claimsAwaitingApprover(
  orgId: string,
  opts: { callerEmployeeId: string | null; roles: string[]; isSuper: boolean },
): Promise<{ id: string; status: string; totalAmount: number; currency: string; title: string; category: string; expenseDate: Date | null; requester: ClaimRequester | null }[]> {
  const claims = await prisma.expenseClaim.findMany({
    where: { orgId, deletedAt: null, status: { in: [...ACTIONABLE_CLAIM_STATUSES] as never } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      totalAmount: true,
      currency: true,
      title: true,
      category: true,
      expenseDate: true,
      policySnapshot: true,
      policy: { select: { approvalChain: true } },
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          profilePhoto: true,
          reportingManagerId: true,
          department: { select: { headId: true } },
        },
      },
      _count: { select: { approvals: true } },
    },
  });

  const { callerEmployeeId, roles, isSuper } = opts;
  // Central Approval Chain (Settings → Approval Chains → "Expense") + the
  // caller's role ids, fetched once (per-org / per-caller, not per-claim). Only
  // consulted for claims whose policy defines no chain of its own.
  const centralLevels = isSuper ? null : await getActiveChainLevels(orgId, "Expense");
  const callerRoleIds =
    !isSuper && centralLevels?.length && callerEmployeeId
      ? await getCallerRoleIds(orgId, callerEmployeeId)
      : [];
  return claims
    .filter((c) => {
      if (isSuper) return true;
      const snap = c.policySnapshot as { approvalChain?: ExpenseChainLevel[] } | null;
      const chain: ExpenseChainLevel[] =
        (snap?.approvalChain as ExpenseChainLevel[] | undefined) ??
        ((c.policy?.approvalChain as ExpenseChainLevel[] | null) ?? []);
      const currentLevel = c._count.approvals + 1;
      if (chain.length === 0) {
        // No per-policy chain → use the central chain if one is configured,
        // otherwise stay legacy-permissive (any approver, matches route fallback).
        if (!centralLevels || centralLevels.length === 0) return true;
        const levelCfg = centralLevels.find((l) => l.level === currentLevel);
        if (!levelCfg) return true;
        return !!callerEmployeeId && callerCanActionLevel(levelCfg, { employeeId: callerEmployeeId, roleIds: callerRoleIds });
      }
      const levelCfg = chain.find((l) => l.level === currentLevel);
      if (!levelCfg) return true; // no config for this level → permissive (matches approve route)
      return isEligibleExpenseApprover(levelCfg, roles, callerEmployeeId, {
        reportingManagerId: c.employee?.reportingManagerId ?? null,
        departmentHeadId: c.employee?.department?.headId ?? null,
      });
    })
    .map((c) => ({
      id: c.id,
      status: c.status,
      totalAmount: Number(c.totalAmount),
      currency: c.currency,
      title: c.title,
      category: c.category,
      expenseDate: c.expenseDate,
      requester: c.employee
        ? {
            id: c.employee.id,
            firstName: c.employee.firstName,
            lastName: c.employee.lastName,
            profilePhoto: c.employee.profilePhoto,
          }
        : null,
    }));
}

export function nextStatusAfterApproval(
  currentStatus: string,
  action: "ExpApproved" | "ExpRejected" | "Escalated",
  currentLevel: number,
  totalLevels: number,
): string {
  if (action === "ExpRejected") return "Rejected";
  if (action === "Escalated") return currentStatus;

  if (currentLevel >= totalLevels) return "Approved";
  if (currentLevel === 1 && totalLevels >= 2) return "ManagerApproved";
  if (currentLevel === 2) return "FinanceApproved";
  return currentStatus;
}

/**
 * Resolve the concrete employee id(s) who can action a given chain level, so a
 * notification can be aimed at them. Mirrors the eligibility rules enforced in
 * the approve route (isEligibleExpenseApprover / central-chain fallback /
 * legacy manager-or-dept-head fallback) but returns WHO, not just a yes/no.
 */
export async function resolveExpenseLevelApproverIds(
  orgId: string,
  level: number,
  chain: ExpenseChainLevel[],
  centralLevels: ChainLevelCfg[] | null,
  claimApprovers: { reportingManagerId: string | null; departmentHeadId: string | null },
  excludeEmployeeId?: string | null,
): Promise<string[]> {
  let ids: string[] = [];

  if (chain.length > 0) {
    const levelCfg = chain.find((c) => c.level === level);
    if (levelCfg) {
      switch (levelCfg.approverType) {
        case "ReportingManager":
          if (claimApprovers.reportingManagerId) ids = [claimApprovers.reportingManagerId];
          break;
        case "DepartmentHead":
          if (claimApprovers.departmentHeadId) ids = [claimApprovers.departmentHeadId];
          break;
        case "Custom":
          if (levelCfg.approverId) ids = [levelCfg.approverId];
          break;
        case "HR":
        case "Finance":
          ids = await findEmployeesWithPermission(orgId, "hrms.expense.approve");
          break;
      }
    }
  } else if (centralLevels && centralLevels.length > 0) {
    const levelCfg = centralLevels.find((c) => c.level === level);
    if (levelCfg) {
      if (levelCfg.kind === "USER" && levelCfg.userId) {
        ids = [levelCfg.userId];
      } else if (levelCfg.kind === "ROLE" && levelCfg.roleId) {
        const holders = await prisma.employee.findMany({
          where: { orgId, deletedAt: null, status: "Active", appRoles: { some: { roleId: levelCfg.roleId } } },
          select: { id: true },
        });
        ids = holders.map((h) => h.id);
      }
    }
  } else {
    // No chain configured anywhere — legacy fallback (reporting manager, else dept head).
    if (claimApprovers.reportingManagerId) ids = [claimApprovers.reportingManagerId];
    else if (claimApprovers.departmentHeadId) ids = [claimApprovers.departmentHeadId];
  }

  return [...new Set(ids)].filter((id) => id && id !== excludeEmployeeId);
}
