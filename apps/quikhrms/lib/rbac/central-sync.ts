/**
 * Central → HRMS membership reconciliation.
 *
 * JIT provisioning (provisioning.ts) maps the central membership to an HRMS
 * role exactly once — at first login. `applyCentralState` reconciles an
 * Employee against the live central state AFTER that:
 *   - member removed / membership deactivated / HRMS app access revoked
 *     centrally → the Employee is suspended here;
 *   - central access restored → a sync-suspended Employee is reactivated;
 *   - central role changed (member ↔ org_admin) → the HRMS admin/employee role
 *     is re-mapped.
 *
 * This is NOT run per request — HRMS trusts the central JWT per request, like
 * the other QuikIT apps (see with-auth.ts). It's invoked on demand by the admin
 * "reconcile-central" endpoint, which fetches live central state in bulk via
 * /api/internal/members/lookup and calls `applyCentralState` for each employee.
 *
 * Role re-mapping acts only on central role TRANSITIONS (current central role
 * vs the last one recorded on Employee.centralRole), so HRMS roles edited
 * locally by an admin are never clobbered by a re-sync of an unchanged
 * central role. Employees from before this column existed are backfilled on
 * their first reconcile pass without touching their roles.
 */

import { prisma } from "@/lib/prisma";
import { type CentralMemberStatus } from "@/lib/auth/member-lookup-remote";
import { invalidateKeys, cacheKeys } from "@/lib/services/cache";
import { APP_ID } from "@/lib/rbac/registry";
import { mappedHrmsRole } from "@/lib/rbac/provisioning";

const QUIKIT_URL = process.env.QUIKIT_URL ?? process.env.NEXT_PUBLIC_QUIKIT_URL;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

/** True when the central lookup endpoint is reachable in this deployment. */
export function centralSyncConfigured(): boolean {
  return Boolean(QUIKIT_URL && INTERNAL_SECRET);
}

/**
 * Reconcile one Employee against their central membership state. Used by the
 * admin batch reconcile endpoint. Returns false when the user no longer has
 * central access (caller reports / acts on it).
 */
export async function applyCentralState(
  orgId: string,
  employeeId: string,
  member: CentralMemberStatus | null,
): Promise<boolean> {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, orgId, deletedAt: null },
    select: { id: true, status: true, centralRole: true, centralDeactivatedAt: true },
  });
  if (!employee) return true; // nothing local to sync against

  // Platform super-admins may operate without an OrgMember row — always live.
  const hasLiveAccess =
    member !== null &&
    (member.isSuperAdmin ||
      (member.found && member.memberStatus === "active" && member.hasAppAccess));

  if (!member || !hasLiveAccess) {
    if (employee.status !== "Suspended") {
      await prisma.employee.update({
        where: { id: employee.id },
        data: { status: "Suspended", centralDeactivatedAt: new Date(), updatedBy: "central-sync" },
      });
      await invalidateKeys(
        cacheKeys.permissions(orgId, employee.id),
        cacheKeys.employeeMe(orgId, employee.id),
      );
    }
    return false;
  }

  // Central access restored after a sync-driven suspension → reactivate.
  // A locally-made suspension (no marker) is deliberate and stays.
  if (employee.centralDeactivatedAt && employee.status === "Suspended") {
    await prisma.employee.update({
      where: { id: employee.id },
      data: { status: "Active", centralDeactivatedAt: null, updatedBy: "central-sync" },
    });
    await invalidateKeys(
      cacheKeys.permissions(orgId, employee.id),
      cacheKeys.employeeMe(orgId, employee.id),
    );
  }

  const liveCentralRole = member.isSuperAdmin ? "super_admin" : member.memberRole;
  if (employee.centralRole !== liveCentralRole) {
    // Pre-column employees: record the baseline without remapping — we can't
    // tell a central change from a missing baseline, and must not clobber
    // locally-assigned roles on the first pass.
    if (employee.centralRole !== null) {
      const oldMapped = mappedHrmsRole(employee.centralRole, employee.centralRole === "super_admin");
      const newMapped = mappedHrmsRole(liveCentralRole, member.isSuperAdmin);
      if (oldMapped !== newMapped) {
        await remapHrmsRole(orgId, employee.id, newMapped);
        await invalidateKeys(cacheKeys.permissions(orgId, employee.id));
      }
    }
    await prisma.employee.update({
      where: { id: employee.id },
      data: { centralRole: liveCentralRole, updatedBy: "central-sync" },
    });
  }

  return true;
}

/**
 * Apply a central admin↔employee transition to the local UserAppRole rows.
 * Promotion adds the admin role (other roles untouched); demotion removes it
 * and guarantees the employee role remains so the user keeps baseline access.
 */
async function remapHrmsRole(orgId: string, employeeId: string, newRole: string): Promise<void> {
  const roles = await prisma.hrmsAppRole.findMany({
    where: { orgId: orgId, appId: APP_ID, name: { in: ["admin", "employee"] } },
    select: { id: true, name: true },
  });
  const adminRole = roles.find((r) => r.name === "admin");
  const employeeRole = roles.find((r) => r.name === "employee");

  if (newRole === "admin") {
    if (!adminRole) return;
    await prisma.hrmsUserAppRole.upsert({
      where: { userId_orgId_roleId: { userId: employeeId, orgId: orgId, roleId: adminRole.id } },
      create: { userId: employeeId, orgId: orgId, roleId: adminRole.id, assignedBy: "central-sync" },
      update: {},
    });
    return;
  }

  if (adminRole) {
    await prisma.hrmsUserAppRole.deleteMany({
      where: { userId: employeeId, orgId: orgId, roleId: adminRole.id },
    });
  }
  const remaining = await prisma.hrmsUserAppRole.count({
    where: { userId: employeeId, orgId: orgId },
  });
  if (remaining === 0 && employeeRole) {
    await prisma.hrmsUserAppRole.upsert({
      where: { userId_orgId_roleId: { userId: employeeId, orgId: orgId, roleId: employeeRole.id } },
      create: { userId: employeeId, orgId: orgId, roleId: employeeRole.id, assignedBy: "central-sync" },
      update: {},
    });
  }
}
