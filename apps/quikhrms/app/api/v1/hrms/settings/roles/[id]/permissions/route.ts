import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, invalidatePermissionCache } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { setRolePermissionsSchema } from "@/lib/validations/rbac";
import { createAuditLog } from "@/lib/utils/audit";
import { APP_ID, splitCode } from "@/lib/rbac/registry";
import { PERMISSION_CODES } from "@/lib/rbac/permissions";

/**
 * PUT /api/v1/hrms/settings/roles/:id/permissions
 * Atomically replaces the role's (resource, action) set with the provided codes.
 */
export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const role = await prisma.hrmsAppRole.findFirst({
      where: { id: params.id, orgId: orgId, appId: APP_ID },
    });
    if (!role) return notFound("Role not found");

    const body = await req.json();
    const parsed = setRolePermissionsSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const knownCodes = new Set<string>(PERMISSION_CODES);
    const unknown = parsed.data.permissions.filter((c) => !knownCodes.has(c));
    if (unknown.length > 0) return validationError(`Unknown permissions: ${unknown.join(", ")}`);

    const pairs = parsed.data.permissions.map(splitCode);

    await prisma.$transaction([
      prisma.hrmsRolePermission.deleteMany({ where: { roleId: role.id } }),
      ...(pairs.length > 0
        ? [prisma.hrmsRolePermission.createMany({
            data: pairs.map((p) => ({ roleId: role.id, resource: p.resource, action: p.action })),
            skipDuplicates: true,
          })]
        : []),
    ]);

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "RolePermissions", entityId: role.id,
      metadata: { name: role.name, permissions: parsed.data.permissions },
    });

    invalidatePermissionCache(orgId);
    return successResponse({ roleId: role.id, permissions: parsed.data.permissions });
  } catch (error) {
    console.error("PUT /settings/roles/:id/permissions error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.rbac.manage"] });
