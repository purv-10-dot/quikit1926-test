import type { AuthContext } from "@/lib/types/api";
import { prisma } from "@/lib/prisma";
import { getCallerEmployeeId } from "@/lib/rbac/scope";

/** Scope map for reading performance data (goals, appraisals). */
export const PERF_READ_MAP = {
  all: "hrms.performance.read",
  team: "hrms.performance.read_team",
  self: "hrms.performance.read_self",
} as const;

/**
 * Appraisal fields the reviewee must NOT see until the appraisal is published
 * (status === "Completed"). Managers and HR always see them.
 */
export const APPRAISAL_PRIVILEGED_FIELDS = [
  "managerRating", "managerComments", "managerResponses",
  "calibratedRating", "finalRating", "finalBand",
  "promotionRecommendation", "salaryRevisionRecommended",
] as const;

/** Null out the manager/final fields on an appraisal row when the caller may not see them yet. */
export function stripUnpublishedAppraisal<T extends Record<string, unknown>>(row: T, canSeePrivileged: boolean): T {
  if (canSeePrivileged) return row;
  const copy: Record<string, unknown> = { ...row };
  for (const f of APPRAISAL_PRIVILEGED_FIELDS) copy[f] = null;
  return copy as T;
}

/** True when the caller is the DIRECT reporting manager of the target employee. */
export async function isDirectManagerOf(ctx: AuthContext, targetEmployeeId: string): Promise<boolean> {
  const callerId = await getCallerEmployeeId(ctx);
  if (!callerId || callerId === targetEmployeeId) return false;
  const target = await prisma.employee.findFirst({
    where: { id: targetEmployeeId, orgId: ctx.orgId, deletedAt: null },
    select: { reportingManagerId: true },
  });
  return !!target && target.reportingManagerId === callerId;
}
