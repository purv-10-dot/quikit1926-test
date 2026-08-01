import { prisma } from "@/lib/prisma";
import { splitCode } from "@/lib/rbac/registry";

/**
 * Resolve every active employee in the tenant who currently holds a
 * permission code (e.g. "hrms.attendance.approve"), either via an assigned
 * role or a direct UserPermissionExtra GRANT, minus any explicit DENY.
 * Mirrors the union-then-subtract logic of resolvePermissions() in
 * lib/with-auth.ts but inverted — given the permission, find the users.
 *
 * Used to target notifications at "whoever can approve X" when there's no
 * single named approver (e.g. no reporting manager on file).
 */
export async function findEmployeesWithPermission(orgId: string, permissionCode: string): Promise<string[]> {
  const { resource, action } = splitCode(permissionCode);
  const now = new Date();

  // Roles in this tenant that grant the permission (or are admin, which
  // bypasses per the auth layer).
  const roles = await prisma.hrmsAppRole.findMany({
    where: {
      orgId,
      OR: [
        { isSystem: true, name: "admin" },
        { permissions: { some: { resource, action } } },
      ],
    },
    select: { id: true },
  });

  const userIds = new Set<string>();

  if (roles.length > 0) {
    const userRoles = await prisma.hrmsUserAppRole.findMany({
      where: {
        orgId,
        roleId: { in: roles.map((r) => r.id) },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { userId: true },
    });
    for (const r of userRoles) userIds.add(r.userId);
  }

  const [grants, denies] = await Promise.all([
    prisma.hrmsUserPermissionExtra.findMany({
      where: { orgId, resource, action, kind: "GRANT" },
      select: { userId: true },
    }),
    prisma.hrmsUserPermissionExtra.findMany({
      where: { orgId, resource, action, kind: "DENY" },
      select: { userId: true },
    }),
  ]);
  for (const g of grants) userIds.add(g.userId);
  for (const d of denies) userIds.delete(d.userId);

  if (userIds.size === 0) return [];

  // Confirm each is still an active employee in this tenant.
  const employees = await prisma.employee.findMany({
    where: { orgId, deletedAt: null, id: { in: Array.from(userIds) } },
    select: { id: true },
  });
  return employees.map((e) => e.id);
}
