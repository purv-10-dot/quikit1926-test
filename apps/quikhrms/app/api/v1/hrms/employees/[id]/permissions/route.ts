import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth, invalidatePermissionCache } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";
import { splitCode, joinCode } from "@/lib/rbac/registry";
import { PERMISSION_CODES } from "@/lib/rbac/permissions";
import { z } from "zod";

// Back-compat: accept old `{ permissions }` (treated as grants) OR new `{ grants, denies }`.
const setExtrasSchema = z.object({
  permissions: z.array(z.string()).optional(),
  grants: z.array(z.string()).optional(),
  denies: z.array(z.string()).optional(),
});

/**
 * GET /api/v1/hrms/employees/:id/permissions
 *
 * Returns the employee's per-user additive permissions (UserPermissionExtra rows).
 * These extend the role grants — DO NOT include role-derived permissions here.
 */
export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) return notFound("Employee not found");

    const extras = await prisma.hrmsUserPermissionExtra.findMany({
      where: { orgId: orgId, userId: params.id },
      select: { resource: true, action: true, kind: true, grantedBy: true, createdAt: true },
      orderBy: [{ resource: "asc" }, { action: "asc" }],
    });

    const grants = extras.filter((e) => e.kind === "GRANT").map((e) => joinCode(e.resource, e.action));
    const denies = extras.filter((e) => e.kind === "DENY").map((e) => joinCode(e.resource, e.action));

    return successResponse({
      employeeId: params.id,
      permissions: grants, // back-compat alias = grants only
      grants,
      denies,
      detail: extras,
    });
  } catch (error) {
    console.error("GET /employees/:id/permissions error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.rbac.manage", "hrms.settings.read"], anyPermission: true });

/**
 * PUT /api/v1/hrms/employees/:id/permissions
 *
 * Atomically replaces the per-user additive grant set with the provided codes.
 * Codes match the same "hrms.<domain>.<action>" wire format as roles.
 */
export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) return notFound("Employee not found");

    const body = await req.json();
    const parsed = setExtrasSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const grants = parsed.data.grants ?? parsed.data.permissions ?? [];
    const denies = parsed.data.denies ?? [];

    const known = new Set<string>(PERMISSION_CODES);
    const unknown = [...grants, ...denies].filter((c) => !known.has(c));
    if (unknown.length > 0) return validationError(`Unknown permissions: ${unknown.join(", ")}`);

    // Same code cannot be both granted and denied.
    const overlap = grants.filter((c) => denies.includes(c));
    if (overlap.length > 0) return validationError(`Code in both grants and denies: ${overlap.join(", ")}`);

    const rows = [
      ...grants.map((c) => ({ ...splitCode(c), kind: "GRANT" as const })),
      ...denies.map((c) => ({ ...splitCode(c), kind: "DENY" as const })),
    ];

    await prisma.$transaction([
      prisma.hrmsUserPermissionExtra.deleteMany({
        where: { orgId: orgId, userId: params.id },
      }),
      ...(rows.length > 0
        ? [prisma.hrmsUserPermissionExtra.createMany({
            data: rows.map((r) => ({
              orgId: orgId,
              userId: params.id,
              resource: r.resource,
              action: r.action,
              kind: r.kind,
              grantedBy: userId,
            })),
            skipDuplicates: true,
          })]
        : []),
    ]);

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "UserPermissionExtra", entityId: params.id,
      metadata: { grants, denies },
    });

    invalidatePermissionCache(orgId, params.id);
    return successResponse({
      employeeId: params.id,
      grants,
      denies,
      permissions: grants,
    });
  } catch (error) {
    console.error("PUT /employees/:id/permissions error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.rbac.manage"] });
