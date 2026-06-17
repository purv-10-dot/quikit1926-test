import type { AuthContext } from "@/lib/types/api";
import { prisma } from "@/lib/prisma";
import { getHierarchyAccessibleEmployeeIds } from "@/lib/rbac/hierarchy";
import { resolveEmployeeId } from "@/lib/resolve-employee";

export type ScopeLevel = "none" | "self" | "team" | "all";

/**
 * Determines which scope the caller is allowed to access.
 * permissions: { all, team, self } — codes for each tier.
 * Returns the highest tier the caller possesses.
 */
export function resolveScope(
  ctx: AuthContext,
  permissions: { all?: string; team?: string; self?: string },
): ScopeLevel {
  if (ctx.permissions.includes("*")) return "all";
  if (permissions.all && ctx.permissions.includes(permissions.all)) return "all";
  if (permissions.team && ctx.permissions.includes(permissions.team)) return "team";
  if (permissions.self && ctx.permissions.includes(permissions.self)) return "self";
  return "none";
}

/**
 * Returns the caller's own Employee.id.
 *
 * Delegates to {@link resolveEmployeeId}: an exact `id === userId` match always
 * wins, and the seeded admin (QK-EMP-0001) is only used as a dev-only fallback
 * (never in production). The previous version did a single `findFirst` with
 * `OR: [{ id: userId }, { employeeCode: "QK-EMP-0001" }]`, which — with no
 * ordering — could return the admin instead of the actual caller, making callers
 * appear to be the admin (who outranks them) and tripping the role-hierarchy
 * guard on their own data.
 */
export async function getCallerEmployeeId(ctx: AuthContext): Promise<string | null> {
  return resolveEmployeeId(ctx.orgId, ctx.userId);
}

/**
 * Returns ids of direct reports for the caller.
 */
export async function getCallerReporteeIds(ctx: AuthContext): Promise<string[]> {
  const callerId = await getCallerEmployeeId(ctx);
  if (!callerId) return [];
  const reps = await prisma.employee.findMany({
    where: { orgId: ctx.orgId, deletedAt: null, reportingManagerId: callerId },
    select: { id: true },
  });
  return reps.map((r) => r.id);
}

/**
 * Build an `employeeId` filter clause based on scope.
 *   all  → no filter
 *   team → IN [callerId, ...reportees]
 *   self → callerId
 *   none → forbidden sentinel (caller should return 403)
 */
export async function employeeScopeFilter(
  ctx: AuthContext,
  scope: ScopeLevel,
): Promise<{ allow: boolean; employeeIds?: string[] }> {
  if (scope === "none") return { allow: false };

  // "all" scope: org-wide read, but constrained by role-priority hierarchy so a
  // user never sees same-level peers or higher roles. super_admin is unlimited.
  if (scope === "all") {
    const hierarchy = await getHierarchyAccessibleEmployeeIds(ctx);
    if (hierarchy.unlimited) return { allow: true };
    return { allow: true, employeeIds: hierarchy.employeeIds ?? [] };
  }

  const callerId = await getCallerEmployeeId(ctx);
  if (!callerId) return { allow: false };
  // self / team follow the reporting line (a manager must still see a direct
  // report even at the same role), so no hierarchy cap is applied here.
  if (scope === "self") return { allow: true, employeeIds: [callerId] };
  const reportees = await getCallerReporteeIds(ctx);
  return { allow: true, employeeIds: [callerId, ...reportees] };
}
