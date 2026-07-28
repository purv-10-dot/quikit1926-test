/**
 * JIT (Just-In-Time) provisioning for central QuikIT users.
 *
 * When a central user with HRMS access logs in via SSO but has no Employee
 * record in this tenant yet, we create one on the fly — so SSO "just works"
 * for any org member (mirrors the platform model where identity is central and
 * the app provisions its own profile on first access).
 *
 * Two things are ensured here, both idempotent:
 *   1. The tenant's HRMS roles exist (seeded from DEFAULT_ROLES on first use).
 *   2. The Employee exists, linked to the central User via authUserId, with a
 *      role mapped from the caller's central membership.
 */

import { prisma } from "@/lib/prisma";
import { APP_ID, splitCode, joinCode } from "@/lib/rbac/registry";
import { PERMISSIONS, DEFAULT_ROLES } from "@/lib/rbac/permissions";
import { generateEmployeeCode } from "@/lib/utils/employee-code";

/** Central membership roles that should map to the HRMS `admin` role. */
export const CENTRAL_ADMIN_ROLES = new Set(["super_admin", "org_admin", "app_admin", "admin"]);

/**
 * Seed the tenant's HRMS AppRoles + RolePermissions if none exist yet.
 * Idempotent — mirrors the RBAC block in prisma/seed.ts. Safe to call on every
 * provision; it no-ops once the tenant has roles.
 */
export async function ensureTenantRolesSeeded(
  orgId: string,
  createdBy: string | null,
): Promise<void> {
  const existing = await prisma.hrmsAppRole.count({ where: { orgId: orgId, appId: APP_ID } });
  if (existing > 0) return;

  for (const r of DEFAULT_ROLES) {
    const isSystem = r.code === "admin";
    const isDefault = r.code === "employee";
    // First login of a fresh tenant fires many requests at once, each trying to
    // seed the same roles. upsert isn't atomic against concurrent inserts, so a
    // loser hits P2002 — catch it and re-use the role the winner just created.
    let role: { id: string };
    try {
      role = await prisma.hrmsAppRole.upsert({
        where: { orgId_appId_name: { orgId: orgId, appId: APP_ID, name: r.code } },
        create: {
          orgId: orgId,
          appId: APP_ID,
          name: r.code,
          description: r.description,
          isSystem,
          isDefault,
          createdBy,
        },
        update: {},
        select: { id: true },
      });
    } catch (e) {
      const existingRole = await prisma.hrmsAppRole.findFirst({
        where: { orgId: orgId, appId: APP_ID, name: r.code },
        select: { id: true },
      });
      if (!existingRole) throw e;
      role = existingRole;
    }

    const targetCodes = r.permissions === "*" ? PERMISSIONS.map((p) => p.code) : r.permissions;
    const count = await prisma.hrmsRolePermission.count({ where: { roleId: role.id } });
    if (count === 0 && targetCodes.length > 0) {
      await prisma.hrmsRolePermission.createMany({
        data: targetCodes.map(splitCode).map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
        skipDuplicates: true,
      });
    }
  }
}

/** Split a token name / email into first + last name parts. */
function nameParts(name: string | null, email: string): { firstName: string; lastName: string } {
  const n = (name ?? "").trim();
  if (n) {
    const i = n.indexOf(" ");
    return i < 0 ? { firstName: n, lastName: "" } : { firstName: n.slice(0, i), lastName: n.slice(i + 1).trim() };
  }
  return { firstName: email.split("@")[0] || "User", lastName: "" };
}

/**
 * Map the caller's central membership to the HRMS role to assign.
 * HRMS has exactly two roles: `admin` (full access) and `employee` (default).
 * Admin-tier central members (super_admin / org_admin / app_admin / admin) and
 * platform super-admins become `admin`; everyone else becomes `employee`.
 * Always returns a role so every provisioned user gets an explicit UserAppRole.
 */
export function mappedHrmsRole(membershipRole: string | null, isSuperAdmin: boolean): string {
  if (isSuperAdmin) return "admin";
  if (membershipRole && CENTRAL_ADMIN_ROLES.has(membershipRole)) return "admin";
  return "employee"; // every provisioned user gets an explicit UserAppRole row
}

export interface ProvisionArgs {
  orgId: string;
  authUserId: string;
  email: string;
  name: string | null;
  membershipRole: string | null;
  isSuperAdmin: boolean;
}

/**
 * JIT-create the Employee for a central user (seeding tenant roles first), then
 * assign a mapped role. Returns the new Employee.id. Resilient to the
 * concurrent-first-request race: on a unique-constraint hit it re-resolves the
 * already-created employee.
 */
export async function provisionEmployee(args: ProvisionArgs): Promise<string> {
  const { orgId, authUserId, email, name, membershipRole, isSuperAdmin } = args;

  await ensureTenantRolesSeeded(orgId, authUserId);

  const { firstName, lastName } = nameParts(name, email);
  // Deterministic, tenant-unique code derived from the central user id.
  const employeeCode = `EMP-${authUserId.slice(-10).toUpperCase()}`;

  let employeeId: string;
  try {
    const created = await prisma.employee.create({
      data: {
        orgId,
        authUserId,
        employeeCode,
        firstName,
        lastName,
        workEmail: email,
        dateOfJoining: new Date(),
        status: "Active",
        // Seed the central-sync baseline so the first sync pass compares
        // against the role this provision was based on (see central-sync.ts).
        centralRole: isSuperAdmin ? "super_admin" : membershipRole,
        createdBy: authUserId,
        updatedBy: authUserId,
      },
      select: { id: true },
    });
    employeeId = created.id;
  } catch (e) {
    // Concurrent first request likely created it — re-resolve and use that.
    const existing = await prisma.employee.findFirst({
      where: { orgId, deletedAt: null, OR: [{ authUserId }, { workEmail: email }] },
      select: { id: true },
    });
    if (!existing) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(`JIT provisioning failed and no employee was found: ${detail}`);
    }
    // Employee already exists — fall through to (idempotent) role assignment so
    // a missing UserAppRole is (re)created on re-provision, not skipped.
    employeeId = existing.id;
  }

  const roleName = mappedHrmsRole(membershipRole, isSuperAdmin);
  if (roleName) {
    const role = await prisma.hrmsAppRole.findFirst({
      where: { orgId: orgId, appId: APP_ID, name: roleName },
      select: { id: true },
    });
    if (role) {
      await prisma.hrmsUserAppRole.upsert({
        where: { userId_orgId_roleId: { userId: employeeId, orgId: orgId, roleId: role.id } },
        create: { userId: employeeId, orgId: orgId, roleId: role.id, assignedBy: authUserId },
        update: {},
      });
    }
  }

  return employeeId;
}

/** A pending invitation, narrowed to the fields needed to materialize an employee. */
export interface InvitationProvisionData {
  id: string;
  firstName: string | null;
  lastName: string | null;
  roleIds: string[];
  departmentId: string | null;
  designationId: string | null;
  managerId: string | null;
  invitedBy: string;
}

export interface ProvisionFromInvitationArgs {
  orgId: string;
  authUserId: string;
  email: string;
  invitation: InvitationProvisionData;
}

/**
 * SSO-native invite landing: a central user is logging in for the first time and
 * a pending Invitation exists for their email. Materialize the Employee now
 * (status Active so their assigned role works immediately), assign the invited
 * roles, and mark the invitation Accepted. Resilient to the concurrent-first-
 * request race like provisionEmployee. Returns the Employee.id.
 */
export async function provisionFromInvitation(args: ProvisionFromInvitationArgs): Promise<string> {
  const { orgId, authUserId, email, invitation } = args;

  await ensureTenantRolesSeeded(orgId, authUserId);

  const employeeCode = await generateEmployeeCode(orgId);

  let employeeId: string;
  try {
    const created = await prisma.employee.create({
      data: {
        orgId,
        authUserId,
        employeeCode,
        firstName: invitation.firstName ?? (email.split("@")[0] || "New"),
        lastName: invitation.lastName ?? "User",
        workEmail: email,
        dateOfJoining: new Date(),
        status: "Active",
        inviteStatus: "Active",
        departmentId: invitation.departmentId,
        designationId: invitation.designationId,
        reportingManagerId: invitation.managerId,
        createdBy: authUserId,
        updatedBy: authUserId,
      },
      select: { id: true },
    });
    employeeId = created.id;
  } catch (e) {
    // Concurrent first request likely created it — re-resolve and use that.
    const existing = await prisma.employee.findFirst({
      where: { orgId, deletedAt: null, OR: [{ authUserId }, { workEmail: email }] },
      select: { id: true },
    });
    if (!existing) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(`Invitation provisioning failed and no employee was found: ${detail}`);
    }
    employeeId = existing.id;
  }

  // Tier guard (defense-in-depth): only grant roles whose permissions the
  // INVITER actually held — even if an over-privileged invite slipped through,
  // provisioning can't escalate the invitee beyond the inviter's own authority.
  // The inviter's roles are resolved live; an "admin" inviter grants anything.
  let grantRoleIds = invitation.roleIds;
  if (grantRoleIds.length > 0) {
    const inviterLinks = await prisma.hrmsUserAppRole.findMany({
      where: { orgId, userId: invitation.invitedBy },
      select: { roleId: true },
    });
    const inviterRoles = inviterLinks.length
      ? await prisma.hrmsAppRole.findMany({
          where: { orgId, id: { in: inviterLinks.map((l) => l.roleId) } },
          select: { name: true, permissions: { select: { resource: true, action: true } } },
        })
      : [];
    const inviterIsSuper = inviterRoles.some((r) => r.name === "admin");
    if (!inviterIsSuper) {
      const held = new Set(inviterRoles.flatMap((r) => r.permissions.map((p) => joinCode(p.resource, p.action))));
      const requested = await prisma.hrmsAppRole.findMany({
        where: { orgId, id: { in: grantRoleIds } },
        select: { id: true, permissions: { select: { resource: true, action: true } } },
      });
      grantRoleIds = requested
        .filter((r) => r.permissions.every((p) => held.has(joinCode(p.resource, p.action))))
        .map((r) => r.id);
    }
  }
  if (grantRoleIds.length > 0) {
    await prisma.hrmsUserAppRole.createMany({
      data: grantRoleIds.map((roleId) => ({
        userId: employeeId,
        orgId: orgId,
        roleId,
        assignedBy: "invitation",
      })),
      skipDuplicates: true,
    });
  }

  // Mark Accepted only while still Pending — idempotent under the race above.
  await prisma.invitation.updateMany({
    where: { id: invitation.id, status: "Pending" },
    data: { status: "Accepted", acceptedAt: new Date(), employeeId },
  });

  return employeeId;
}
