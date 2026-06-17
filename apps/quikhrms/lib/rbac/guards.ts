import { prisma } from "@/lib/prisma";
import { APP_ID } from "@/lib/rbac/registry";

/**
 * Ensure at least one active admin remains after a role change.
 * Pass the *target* employee ids and the *incoming* roleId (or null to clear).
 * Throws if the change would leave zero admins in the tenant.
 *
 * Now reads from UserAppRole join (multi-role per employee).
 */
export async function ensureSuperAdminRemains(
  orgId: string,
  employeeIds: string[],
  incomingRoleId: string | null,
): Promise<void> {
  const superRole = await prisma.hrmsAppRole.findFirst({
    where: { orgId: orgId, appId: APP_ID, name: "admin" },
    select: { id: true },
  });
  if (!superRole) return; // no admin role at all — nothing to guard

  // If incoming role IS admin, the change adds rather than removes.
  if (incomingRoleId === superRole.id) return;

  const totalSupers = await prisma.hrmsUserAppRole.count({
    where: { orgId: orgId, roleId: superRole.id },
  });

  const affectedSupers = await prisma.hrmsUserAppRole.count({
    where: { orgId: orgId, roleId: superRole.id, userId: { in: employeeIds } },
  });

  if (totalSupers - affectedSupers <= 0) {
    throw new Error("Cannot remove the last admin. Assign another user as admin first.");
  }
}
