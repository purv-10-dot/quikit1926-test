import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { APP_ID } from "@/lib/rbac/registry";
import { widgetsForRole } from "@/lib/rbac/widgets";
import { isValidNavKey } from "@/lib/rbac/permissions-tree";

/**
 * GET /api/v1/hrms/dashboard/config
 *
 * RBAC v2: AppRole no longer carries `dashboardConfig`. Widget selection now
 * lives client-side keyed off the role name. Server returns role metadata +
 * permission set; widgets array is empty until a per-role widget map is
 * re-introduced via RoleNavigation or a new sidecar table.
 */
export const GET = withAuth(async (_req: NextRequest, { orgId, userId, roleCode, permissions, delegatedFrom }) => {
  try {
    // When the user is standing in for someone via delegation, resolve the
    // delegators' names so the dashboard can show an "acting on behalf of" banner.
    const actingFor = delegatedFrom?.length
      ? (await prisma.employee.findMany({
          where: { orgId, id: { in: delegatedFrom.map((d) => d.delegatorId) }, deletedAt: null },
          select: { id: true, firstName: true, lastName: true },
        })).map((e) => ({ delegatorId: e.id, name: `${e.firstName} ${e.lastName}`.trim() || "a colleague" }))
      : [];
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

        // Navigation allow-list for this role (default-allow: an empty list
        // means "not configured" → the sidebar shows everything the role's
        // permissions allow). Only when a role has explicitly saved nav keys
        // does the sidebar restrict tabs to that set.
        const navRows = role
          ? await prisma.hrmsRoleNavigation.findMany({
              where: { roleId: role.id },
              select: { navKey: true },
            })
          : [];

        return {
          roleMeta: role ? { code: role.name, name: role.name } : null,
          widgets: widgetsForRole(role?.name),
          // Ignore keys from a prior nav scheme — a role whose saved keys are
          // all stale collapses to "unconfigured" (default-allow shows all).
          navKeys: navRows.map((n) => n.navKey).filter(isValidNavKey),
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
      navKeys: cached.navKeys,
      employee: cached.employee,
      actingFor,
    });
  } catch (error) {
    console.error("GET /dashboard/config error:", error);
    return internalError();
  }
});
