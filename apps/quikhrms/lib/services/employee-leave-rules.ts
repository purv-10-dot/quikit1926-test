/**
 * Per-employee leave rules resolver.
 *
 * An employee's leave rules for a given type come from the ACTIVE Leave Group
 * they belong to (see the leave-rules wizard, saved on LeaveGroupItem.rules).
 * A direct Employee assignment wins over a Role-based assignment. Returns null
 * when the employee is in no group, the group has no item for this type, or the
 * item carries no configured rules — callers then fall back to LeaveType columns.
 *
 * The rule keys mirror the LeaveType column names 1:1 (the wizard payload uses
 * the same field names), so callers can spread the result straight over the
 * LeaveType object to get an "effective" rule set.
 */
import { prisma } from "@/lib/prisma";

export interface GroupLeaveRules {
  isUnlimited?: boolean;
  maxBalance?: number;
  isNegativeBalanceAllowed?: boolean;
  maxNegativeBalance?: number | null;
  maxDaysPerMonth?: number | null;
  minGapDays?: number | null;
  applicableAfterDays?: number;
  applicableAfterRef?: string | null;
  advanceNoticeDays?: number | null;
  maxConsecutiveDays?: number | null;
  selfApplyAllowed?: boolean;
  requiresApproval?: boolean;
  requiresComment?: boolean;
  backdateCutoffDay?: number | null;
  applyCutoffDay?: number | null;
  blockedDuringNotice?: boolean;
  [k: string]: unknown;
}

export async function getEmployeeLeaveRules(
  orgId: string,
  employeeId: string,
  roleId: string | null,
  leaveTypeId: string,
): Promise<GroupLeaveRules | null> {
  const assignments = await prisma.leaveGroupAssignment.findMany({
    where: {
      orgId,
      leaveGroup: { deletedAt: null, isActive: true },
      OR: [{ employeeId }, ...(roleId ? [{ roleId }] : [])],
    },
    select: { employeeId: true, leaveGroupId: true },
  });
  if (!assignments.length) return null;

  // Direct employee assignment wins over a role assignment.
  const chosen = assignments.find((a) => a.employeeId === employeeId) ?? assignments[0];

  const item = await prisma.leaveGroupItem.findFirst({
    where: { orgId, leaveGroupId: chosen.leaveGroupId, leaveTypeId },
    select: { rules: true },
  });
  // Not a member type of the employee's group → not governed (null).
  if (!item) return null;
  // In the group but no rules configured yet → governed with empty rules ({}),
  // so the group still defines entitlement (quota defaults to 0, not stale accrual).
  if (!item.rules || typeof item.rules !== "object") return {};
  return item.rules as GroupLeaveRules;
}
