import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, invalidatePermissionCache } from "@/lib/with-auth";
import { successResponse, notFound, validationError, conflict, forbidden, internalError } from "@/lib/api-response";
import { updateRoleSchema } from "@/lib/validations/rbac";
import { createAuditLog } from "@/lib/utils/audit";
import { APP_ID, joinCode } from "@/lib/rbac/registry";
import { PERMISSIONS } from "@/lib/rbac/permissions";

const PERM_BY_CODE = new Map(PERMISSIONS.map((p) => [p.code, p]));

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const role = await prisma.hrmsAppRole.findFirst({
      where: { id: params.id, orgId: orgId, appId: APP_ID },
      include: {
        permissions: { select: { resource: true, action: true } },
        _count: { select: { members: true } },
      },
    });
    if (!role) return notFound("Role not found");
    return successResponse({
      ...role,
      // UI back-compat aliases
      code: role.name,
      priority: 0,
      permissions: role.permissions
        .map((p) => PERM_BY_CODE.get(joinCode(p.resource, p.action)))
        .filter((p): p is NonNullable<typeof p> => Boolean(p)),
      employeeCount: role._count.members,
    });
  } catch (error) {
    console.error("GET /settings/roles/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.rbac.manage", "hrms.settings.read"], anyPermission: true });

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.hrmsAppRole.findFirst({
      where: { id: params.id, orgId: orgId, appId: APP_ID },
    });
    if (!existing) return notFound("Role not found");
    if (existing.isSystem) return forbidden("System roles cannot be renamed");

    const body = await req.json();
    const parsed = updateRoleSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    // Block unsetting the only default — tenant must always have one.
    if (parsed.data.isDefault === false && existing.isDefault) {
      const otherDefaults = await prisma.hrmsAppRole.count({
        where: { orgId: orgId, appId: APP_ID, isDefault: true, NOT: { id: params.id } },
      });
      if (otherDefaults === 0) {
        return conflict("Cannot unset default — at least one role must be the default. Set another role as default first.");
      }
    }

    const role = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault === true) {
        await tx.hrmsAppRole.updateMany({
          where: { orgId: orgId, appId: APP_ID, isDefault: true, NOT: { id: params.id } },
          data: { isDefault: false },
        });
      }
      return tx.hrmsAppRole.update({
        where: { id: params.id },
        data: { ...parsed.data },
      });
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "AppRole", entityId: role.id,
      changes: parsed.data,
    });

    invalidatePermissionCache(orgId);
    return successResponse(role);
  } catch (error) {
    console.error("PATCH /settings/roles/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.rbac.manage"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.hrmsAppRole.findFirst({
      where: { id: params.id, orgId: orgId, appId: APP_ID },
    });
    if (!existing) return notFound("Role not found");
    if (existing.isSystem) return forbidden("Cannot delete a system role");

    const inUse = await prisma.hrmsUserAppRole.count({
      where: { orgId: orgId, roleId: params.id },
    });
    if (inUse > 0) return conflict(`Role is assigned to ${inUse} employee(s). Reassign first.`);

    // Block deleting the only default — tenant must always have one.
    if (existing.isDefault) {
      const otherDefaults = await prisma.hrmsAppRole.count({
        where: { orgId: orgId, appId: APP_ID, isDefault: true, NOT: { id: params.id } },
      });
      if (otherDefaults === 0) {
        return conflict("Cannot delete the default role. Mark another role as default first.");
      }
    }

    // Cascade drops RolePermission + RoleNavigation rows.
    await prisma.hrmsAppRole.delete({ where: { id: params.id } });

    await createAuditLog({
      orgId, userId, action: "Delete", entityType: "AppRole", entityId: params.id,
      metadata: { name: existing.name },
    });

    invalidatePermissionCache(orgId);
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("DELETE /settings/roles/:id error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.rbac.manage"] });
