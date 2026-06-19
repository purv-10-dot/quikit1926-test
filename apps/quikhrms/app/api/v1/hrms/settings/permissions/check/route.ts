import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { APP_ID, joinCode } from "@/lib/rbac/registry";
import { PERMISSIONS } from "@/lib/rbac/permissions";

/**
 * GET /api/v1/hrms/settings/permissions/check?employeeId=xxx
 * Returns effective permissions for an employee (own if omitted).
 * Useful for admins to debug RBAC.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, userId, permissions, roleCode } = ctx;
    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get("employeeId") ?? userId;

    if (targetId === userId) {
      return successResponse({
        employeeId: userId,
        roleCode,
        permissions,
        isSuperAdmin: permissions.includes("*"),
      });
    }

    if (!permissions.includes("*") && !permissions.includes("hrms.rbac.manage")) {
      return successResponse({
        employeeId: targetId,
        error: "Requires hrms.rbac.manage to inspect other users",
      });
    }

    const emp = await prisma.employee.findFirst({
      where: { id: targetId, orgId, deletedAt: null },
      select: {
        id: true, firstName: true, lastName: true, employeeCode: true,
        appRoles: {
          select: {
            role: {
              select: {
                id: true, name: true,
                permissions: { select: { resource: true, action: true } },
              },
            },
          },
        },
        permissionOverrides: {
          where: { orgId: orgId },
          select: { resource: true, action: true },
        },
      },
    });
    if (!emp) return successResponse({ employeeId: targetId, error: "Employee not found" });

    const codeSet = new Set<string>();
    for (const link of emp.appRoles) {
      for (const rp of link.role.permissions) {
        codeSet.add(joinCode(rp.resource, rp.action));
      }
    }
    for (const e of emp.permissionOverrides) {
      codeSet.add(joinCode(e.resource, e.action));
    }
    const codes = Array.from(codeSet);

    const byCategory: Record<string, string[]> = {};
    for (const c of codes) {
      const def = PERMISSIONS.find((p) => p.code === c);
      const cat = def?.category ?? "Other";
      (byCategory[cat] ??= []).push(c);
    }

    const primaryRole = emp.appRoles[0]?.role ?? null;

    return successResponse({
      employee: { id: emp.id, name: `${emp.firstName} ${emp.lastName}`, code: emp.employeeCode },
      role: primaryRole ? { id: primaryRole.id, code: primaryRole.name, name: primaryRole.name } : null,
      permissions: codes,
      byCategory,
    });
  } catch (error) {
    console.error("GET /settings/permissions/check error:", error);
    return internalError();
  }
});
