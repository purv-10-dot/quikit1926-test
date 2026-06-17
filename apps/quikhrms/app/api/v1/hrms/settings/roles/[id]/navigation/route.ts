import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, invalidatePermissionCache } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";
import { APP_ID } from "@/lib/rbac/registry";
import { isValidNavKey } from "@/lib/rbac/permissions-tree";
import { z } from "zod";

const setNavSchema = z.object({
  navKeys: z.array(z.string()).min(0),
});

/**
 * GET /api/v1/hrms/settings/roles/:id/navigation
 * Returns the role's RoleNavigation row keys.
 */
export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const role = await prisma.hrmsAppRole.findFirst({
      where: { id: params.id, orgId: orgId, appId: APP_ID },
      select: { id: true, navigations: { select: { navKey: true } } },
    });
    if (!role) return notFound("Role not found");
    return successResponse({
      roleId: role.id,
      navKeys: role.navigations.map((n) => n.navKey),
    });
  } catch (error) {
    console.error("GET /settings/roles/:id/navigation error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.rbac.manage", "hrms.settings.read"], anyPermission: true });

/**
 * PUT /api/v1/hrms/settings/roles/:id/navigation
 * Atomic replace of RoleNavigation rows for the role.
 */
export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const role = await prisma.hrmsAppRole.findFirst({
      where: { id: params.id, orgId: orgId, appId: APP_ID },
      select: { id: true, name: true },
    });
    if (!role) return notFound("Role not found");

    const body = await req.json();
    const parsed = setNavSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const unknown = parsed.data.navKeys.filter((k) => !isValidNavKey(k));
    if (unknown.length > 0) return validationError(`Unknown nav keys: ${unknown.join(", ")}`);

    await prisma.$transaction([
      prisma.hrmsRoleNavigation.deleteMany({ where: { roleId: role.id } }),
      ...(parsed.data.navKeys.length > 0
        ? [prisma.hrmsRoleNavigation.createMany({
            data: parsed.data.navKeys.map((navKey) => ({ roleId: role.id, navKey })),
            skipDuplicates: true,
          })]
        : []),
    ]);

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "RoleNavigation", entityId: role.id,
      metadata: { name: role.name, navKeys: parsed.data.navKeys },
    });

    invalidatePermissionCache(orgId);
    return successResponse({ roleId: role.id, navKeys: parsed.data.navKeys });
  } catch (error) {
    console.error("PUT /settings/roles/:id/navigation error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.rbac.manage"] });
