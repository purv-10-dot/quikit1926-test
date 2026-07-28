import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, invalidatePermissionCache } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { assignRoleSchema } from "@/lib/validations/rbac";
import { createAuditLog } from "@/lib/utils/audit";
import { ensureSuperAdminRemains } from "@/lib/rbac/guards";
import { APP_ID, joinCode } from "@/lib/rbac/registry";
import { mirrorHrmsRolesToCentral } from "@/lib/rbac/mirrorRole";

/**
 * PUT /api/v1/hrms/employees/:id/role — replace employee's primary role.
 *
 * Semantics: deletes all existing UserAppRole rows for the employee in this
 * tenant, then inserts the new one (if roleId is provided).
 */
export const PUT = withAuth(async (req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) return notFound("Employee not found");

    const body = await req.json();
    const parsed = assignRoleSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    let roleName: string | null = null;
    if (parsed.data.roleId) {
      const role = await prisma.hrmsAppRole.findFirst({
        where: { id: parsed.data.roleId, orgId: orgId, appId: APP_ID },
        select: { id: true, name: true, permissions: { select: { resource: true, action: true } } },
      });
      if (!role) return validationError("Role not found");
      roleName = role.name;

      // Tier guard: you can't assign a role that carries permissions you don't
      // hold yourself (blocks a non-admin rbac.manager from granting admin).
      if (!permissions.includes("*")) {
        const held = new Set(permissions);
        const missing = role.permissions
          .map((p) => joinCode(p.resource, p.action))
          .filter((c) => !held.has(c));
        if (missing.length) {
          return validationError(`You can't assign a role with permissions you don't hold: ${missing.join(", ")}`);
        }
      }
    }

    try {
      await ensureSuperAdminRemains(orgId, [params.id], parsed.data.roleId);
    } catch (e) {
      return validationError(e instanceof Error ? e.message : "Super admin guard failed");
    }

    const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      return validationError("expiresAt must be a future date");
    }

    await prisma.$transaction(async (tx) => {
      await tx.hrmsUserAppRole.deleteMany({
        where: { orgId: orgId, userId: params.id },
      });
      if (parsed.data.roleId) {
        await tx.hrmsUserAppRole.create({
          data: {
            orgId: orgId,
            userId: params.id,
            roleId: parsed.data.roleId,
            assignedBy: userId,
            expiresAt,
          },
        });
      }
    });

    // Keep the central UserAppAccess.role mirror (what the Admin Portal shows)
    // in sync with the role just assigned in QuikHrms.
    await mirrorHrmsRolesToCentral(orgId, [params.id], roleName);

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "EmployeeRole", entityId: params.id,
      metadata: { roleId: parsed.data.roleId, roleName, expiresAt: expiresAt?.toISOString() ?? null },
    });

    invalidatePermissionCache(orgId, params.id);
    return successResponse({ id: params.id, roleId: parsed.data.roleId, roleName, expiresAt: expiresAt?.toISOString() ?? null });
  } catch (error) {
    console.error("PUT /employees/:id/role error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.rbac.manage"] });
