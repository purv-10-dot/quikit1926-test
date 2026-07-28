import { prisma } from "@/lib/prisma";

export interface WfhGroupRules {
  id: string;
  name: string;
  yearlyQuota: number;
  maxPerWeek: number | null;
  maxPerMonth: number | null;
  maxConsecutiveDays: number | null;
  advanceNoticeDays: number | null;
  applicableAfterDays: number | null;
  requiresApproval: boolean;
  blockedDuringNotice: boolean;
}

export interface EffectiveQuota {
  group: WfhGroupRules | null;
  source: "explicit" | "department" | null;
}

// Fields selected for the effective group (quota + rules).
const groupSelect = {
  id: true, name: true, yearlyQuota: true, isActive: true, deletedAt: true,
  maxPerWeek: true, maxPerMonth: true, maxConsecutiveDays: true,
  advanceNoticeDays: true, applicableAfterDays: true,
  requiresApproval: true, blockedDuringNotice: true,
} as const;

type RawGroup = {
  id: string; name: string; yearlyQuota: number;
  maxPerWeek: number | null; maxPerMonth: number | null; maxConsecutiveDays: number | null;
  advanceNoticeDays: number | null; applicableAfterDays: number | null;
  requiresApproval: boolean; blockedDuringNotice: boolean;
};

function toRules(g: RawGroup): WfhGroupRules {
  return {
    id: g.id, name: g.name, yearlyQuota: g.yearlyQuota,
    maxPerWeek: g.maxPerWeek, maxPerMonth: g.maxPerMonth, maxConsecutiveDays: g.maxConsecutiveDays,
    advanceNoticeDays: g.advanceNoticeDays, applicableAfterDays: g.applicableAfterDays,
    requiresApproval: g.requiresApproval, blockedDuringNotice: g.blockedDuringNotice,
  };
}

/**
 * Resolve an employee's effective WFH quota group (+ its rules).
 * Priority: explicit assignment > department mapping > none.
 */
export async function resolveEffectiveWfhQuotaGroup(
  orgId: string,
  employeeId: string,
): Promise<EffectiveQuota> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, orgId, deletedAt: null },
    select: {
      departmentId: true,
      wfhQuotaGroup: { select: groupSelect },
    },
  });
  if (!employee) return { group: null, source: null };

  const explicit = employee.wfhQuotaGroup;
  if (explicit && explicit.isActive && !explicit.deletedAt) {
    return { group: toRules(explicit), source: "explicit" };
  }

  if (!employee.departmentId) return { group: null, source: null };

  const deptGroup = await prisma.wfhQuotaGroup.findFirst({
    where: { orgId, departmentIds: { has: employee.departmentId } },
    select: groupSelect,
  });
  if (!deptGroup || !deptGroup.isActive || deptGroup.deletedAt) {
    return { group: null, source: null };
  }
  return { group: toRules(deptGroup), source: "department" };
}
