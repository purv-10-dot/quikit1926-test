import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { APP_ID } from "@/lib/rbac/registry";
import { widgetsForRole } from "@/lib/rbac/widgets";

/**
 * GET /api/v1/hrms/dashboard/config
 *
 * RBAC v2: AppRole no longer carries `dashboardConfig`. Widget selection now
 * lives client-side keyed off the role name. Server returns role metadata +
 * permission set; widgets array is empty until a per-role widget map is
 * re-introduced via RoleNavigation or a new sidecar table.
 */
export const GET = withAuth(async (_req: NextRequest, { orgId, userId, roleCode, permissions }) => {
  try {
    const cached = await (async () => {
        const emp = await prisma.employee.findFirst({
          where: { orgId, deletedAt: null, OR: [{ id: userId }, { employeeCode: "QK-EMP-0001" }] },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            jobTitle: true,
            profilePhoto: true,
            status: true,
            appRoles: {
              select: { role: { select: { id: true, name: true } } },
              take: 1,
            },
          },
        });

        let role = emp?.appRoles[0]?.role ?? null;
        if (!role) {
          // Fall back to the org's default role, or "employee" by name.
          role = (await prisma.hrmsAppRole.findFirst({
            where: { orgId: orgId, appId: APP_ID, isDefault: true },
            select: { id: true, name: true },
          }))
            ?? (await prisma.hrmsAppRole.findFirst({
              where: { orgId: orgId, appId: APP_ID, name: "employee" },
              select: { id: true, name: true },
            }));
        }

        return {
          roleMeta: role ? { code: role.name, name: role.name } : null,
          widgets: widgetsForRole(role?.name),
          employee: emp ? {
            id: emp.id,
            name: `${emp.firstName} ${emp.lastName}`.trim(),
            jobTitle: emp.jobTitle,
            profilePhoto: emp.profilePhoto,
            status: emp.status,
          } : null,
        };
      })();

    return successResponse({
      role: cached.roleMeta ?? { code: roleCode ?? "unknown", name: roleCode ?? "Unknown" },
      widgets: cached.widgets,
      permissions,
      employee: cached.employee,
    });
  } catch (error) {
    console.error("GET /dashboard/config error:", error);
    return internalError();
  }
});
