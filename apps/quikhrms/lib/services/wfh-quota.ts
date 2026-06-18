import { prisma } from "@/lib/prisma";

export interface EffectiveQuota {
  group: { id: string; name: string; yearlyQuota: number } | null;
  source: "explicit" | "department" | null;
}

/**
 * Resolve an employee's effective WFH quota group.
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
      wfhQuotaGroup: {
        select: { id: true, name: true, yearlyQuota: true, isActive: true, deletedAt: true },
      },
    },
  });
  if (!employee) return { group: null, source: null };

  if (employee.wfhQuotaGroup && employee.wfhQuotaGroup.isActive && !employee.wfhQuotaGroup.deletedAt) {
    return {
      group: { id: employee.wfhQuotaGroup.id, name: employee.wfhQuotaGroup.name, yearlyQuota: employee.wfhQuotaGroup.yearlyQuota },
      source: "explicit",
    };
  }

  if (!employee.departmentId) return { group: null, source: null };

  const deptGroup = await prisma.wfhQuotaGroup.findFirst({
    where: { orgId, departmentIds: { has: employee.departmentId } },
    select: { id: true, name: true, yearlyQuota: true, isActive: true, deletedAt: true },
  });
  if (!deptGroup || !deptGroup.isActive || deptGroup.deletedAt) {
    return { group: null, source: null };
  }
  return {
    group: { id: deptGroup.id, name: deptGroup.name, yearlyQuota: deptGroup.yearlyQuota },
    source: "department",
  };
}
