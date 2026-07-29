import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { createRoleSchema } from "@/lib/validations/rbac";
import { createAuditLog } from "@/lib/utils/audit";
import { APP_ID, splitCode, joinCode } from "@/lib/rbac/registry";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { validateGrantableCodes } from "@/lib/rbac/validate-grant";

const PERM_BY_CODE = new Map(PERMISSIONS.map((p) => [p.code, p]));

/** GET /api/v1/hrms/settings/roles */
export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const roles = await prisma.hrmsAppRole.findMany({
      where: { orgId: orgId, appId: APP_ID },
      orderBy: [{ name: "asc" }],
      include: {
        permissions: { select: { resource: true, action: true } },
        _count: { select: { members: true } },
      },
    });
    const shaped = roles.map((r) => ({
      id: r.id,
      // UI back-compat: surface `name` as `code` too (AppRole identity is name).
      code: r.name,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      isDefault: r.isDefault,
      // UI back-compat: priority removed from AppRole; pin to 0.
      priority: 0,
      permissions: r.permissions
        .map((p) => PERM_BY_CODE.get(joinCode(p.resource, p.action)))
        .filter((p): p is NonNullable<typeof p> => Boolean(p)),
      employeeCount: r._count.members,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    return successResponse(shaped);
  } catch (error) {
    console.error("GET /settings/roles error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.rbac.manage", "hrms.settings.read"], anyPermission: true });

/** POST /api/v1/hrms/settings/roles */
export const POST = withAuth(async (req: NextRequest, { orgId, userId, permissions }) => {
  try {
    const body = await req.json();
    const parsed = createRoleSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;

    // Reject "*" / unknown codes and block self-elevation (can't grant what you
    // don't hold). Prevents creating a super-role via this path.
    const grantCheck = validateGrantableCodes(data.permissions, permissions);
    if (!grantCheck.ok) return validationError(grantCheck.error);

    const existing = await prisma.hrmsAppRole.findFirst({
      where: { orgId: orgId, appId: APP_ID, name: data.name },
    });
    if (existing) return conflict("Role with this name already exists");

    const permPairs = data.permissions.map(splitCode);

    // The default role (what unassigned employees inherit) is set EXPLICITLY —
    // never silently auto-promote a freshly-created role, or a new role could
    // mass-grant its permissions to every unassigned employee.
    const isDefault = data.isDefault;

    // If marking this role default, demote any existing default first.
    const role = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.hrmsAppRole.updateMany({
          where: { orgId: orgId, appId: APP_ID, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.hrmsAppRole.create({
        data: {
          orgId: orgId,
          appId: APP_ID,
          name: data.name,
          description: data.description,
          isDefault,
          isSystem: false,
          createdBy: userId,
          permissions: permPairs.length > 0
            ? { create: permPairs.map((p) => ({ resource: p.resource, action: p.action })) }
            : undefined,
        },
        include: { permissions: { select: { resource: true, action: true } } },
      });
    });

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "AppRole", entityId: role.id,
      metadata: { name: role.name, permissions: data.permissions },
    });

    return successResponse(role, undefined, 201);
  } catch (error) {
    console.error("POST /settings/roles error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.rbac.manage"] });
