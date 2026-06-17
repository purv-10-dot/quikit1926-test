import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/types/api";
import { getCallerEmployeeId } from "@/lib/rbac/scope";
import { APP_ID, rolePriority } from "@/lib/rbac/registry";

export interface HierarchyAccess {
  /** true = no hierarchy limit (super_admin / unlimited). employeeIds not needed. */
  unlimited: boolean;
  /** Employee IDs whose role priority is STRICTLY LOWER than the caller's (plus caller themselves).
   *  Same-level peers are excluded — one user cannot see another at the same role/level. */
  employeeIds?: string[];
  /** Caller's own priority (null if unresolved). */
  callerPriority: number | null;
}

/**
 * Resolves which employees the caller is allowed to view based on role-priority hierarchy.
 * Rule: a caller can only see employees of a STRICTLY LOWER role priority (plus
 * themselves). Same-level peers and higher-level roles are not visible.
 *
 * RBAC v2: AppRole no longer carries `priority` — priority comes from the
 * static ROLE_PRIORITY map keyed by role name. Lookups now traverse the
 * UserAppRole join (multi-role per employee → use MAX priority).
 *
 * super_admin (permissions: *) gets unlimited access.
 */
export async function getHierarchyAccessibleEmployeeIds(ctx: AuthContext): Promise<HierarchyAccess> {
  if (ctx.permissions.includes("*")) {
    return { unlimited: true, callerPriority: Number.MAX_SAFE_INTEGER };
  }

  const callerId = await getCallerEmployeeId(ctx);
  if (!callerId) return { unlimited: false, employeeIds: [], callerPriority: null };

  // Pull every role the caller is on; pick max priority by name.
  const callerRoles = await prisma.hrmsUserAppRole.findMany({
    where: { orgId: ctx.orgId, userId: callerId, role: { appId: APP_ID } },
    select: { role: { select: { name: true } } },
  });
  if (callerRoles.some((r) => r.role.name === "admin")) {
    return { unlimited: true, callerPriority: Number.MAX_SAFE_INTEGER };
  }
  const callerPriority = callerRoles.reduce(
    (max, r) => Math.max(max, rolePriority(r.role.name)),
    0,
  );

  // Build the visible set: every employee whose highest role priority is
  // strictly lower than the caller's (same-level peers excluded; caller added below).
  // Step 1: pull every (employeeId, role.name) link in the tenant + roleless employees.
  const tenantRoleLinks = await prisma.hrmsUserAppRole.findMany({
    where: { orgId: ctx.orgId, role: { appId: APP_ID } },
    select: { userId: true, role: { select: { name: true } } },
  });
  const empMaxPriority = new Map<string, number>();
  for (const link of tenantRoleLinks) {
    const p = rolePriority(link.role.name);
    const cur = empMaxPriority.get(link.userId) ?? 0;
    if (p > cur) empMaxPriority.set(link.userId, p);
  }

  // Step 2: include all active employees in tenant, defaulting priority to 0 when unmapped.
  const all = await prisma.employee.findMany({
    where: { orgId: ctx.orgId, deletedAt: null },
    select: { id: true },
  });

  const employeeIds: string[] = [];
  for (const e of all) {
    const p = empMaxPriority.get(e.id) ?? 0;
    if (p < callerPriority) employeeIds.push(e.id);
  }
  if (!employeeIds.includes(callerId)) employeeIds.push(callerId);
  return { unlimited: false, employeeIds, callerPriority };
}

/**
 * Intersects a pre-existing employeeIds filter with the hierarchy filter.
 * Returns the final list (or null to indicate "no filter", only when both sides unlimited).
 */
export function intersectEmployeeIds(
  existing: string[] | undefined,
  hierarchy: HierarchyAccess,
): string[] | undefined {
  if (hierarchy.unlimited) return existing;
  if (!existing) return hierarchy.employeeIds;
  const set = new Set(hierarchy.employeeIds ?? []);
  return existing.filter((id) => set.has(id));
}

/**
 * Checks whether the caller can access a specific target employee's data.
 */
export async function canAccessEmployee(ctx: AuthContext, targetEmployeeId: string): Promise<boolean> {
  if (ctx.permissions.includes("*")) return true;
  const hierarchy = await getHierarchyAccessibleEmployeeIds(ctx);
  if (hierarchy.unlimited) return true;
  return (hierarchy.employeeIds ?? []).includes(targetEmployeeId);
}
