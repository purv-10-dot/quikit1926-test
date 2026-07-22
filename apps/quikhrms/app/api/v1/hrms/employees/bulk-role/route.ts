import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, invalidatePermissionCache } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";
import { ensureSuperAdminRemains } from "@/lib/rbac/guards";
import { APP_ID } from "@/lib/rbac/registry";
import { mirrorHrmsRolesToCentral } from "@/lib/rbac/mirrorRole";
import { z } from "zod";

const bulkRoleSchema = z.object({
  employeeIds: z.array(z.string()).min(1).max(500),
  roleId: z.string().nullable(),
});

/**
 * PUT /api/v1/hrms/employees/bulk-role
 * Body: { employeeIds: string[], roleId: string | null }
 *
 * Replaces every listed employee's UserAppRole rows with one row pointing at
 * roleId (or deletes them if roleId is null).
 */
export const PUT = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = bulkRoleSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { employeeIds, roleId } = parsed.data;

    let roleName: string | null = null;
    if (roleId) {
      const role = await prisma.hrmsAppRole.findFirst({
        where: { id: roleId, orgId: orgId, appId: APP_ID },
        select: { id: true, name: true },
      });
      if (!role) return validationError("Role not found");
      roleName = role.name;
    }

    try {
      await ensureSuperAdminRemains(orgId, employeeIds, roleId);
    } catch (e) {
      return validationError(e instanceof Error ? e.message : "Super admin guard failed");
    }

    // Filter to employees actually in this tenant.
    const valid = await prisma.employee.findMany({
      where: { id: { in: employeeIds }, orgId, deletedAt: null },
      select: { id: true },
    });
    const validIds = valid.map((v) => v.id);

    await prisma.$transaction(async (tx) => {
      await tx.hrmsUserAppRole.deleteMany({
        where: { orgId: orgId, userId: { in: validIds } },
      });
      if (roleId && validIds.length > 0) {
        await tx.hrmsUserAppRole.createMany({
          data: validIds.map((id) => ({
            orgId: orgId, userId: id, roleId, assignedBy: userId,
          })),
          skipDuplicates: true,
        });
      }
    });

    // Keep the central UserAppAccess.role mirror (what the Admin Portal shows)
    // in sync with the role just assigned in QuikHrms.
    await mirrorHrmsRolesToCentral(orgId, validIds, roleName);

    for (const id of validIds) invalidatePermissionCache(orgId, id);

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "EmployeeRole",
      metadata: { roleId, employeeIds: validIds, count: validIds.length },
    });

    return successResponse({ updated: validIds.length });
  } catch (error) {
    console.error("PUT /employees/bulk-role error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.rbac.manage"] });
