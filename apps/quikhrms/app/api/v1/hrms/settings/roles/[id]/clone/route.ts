import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, conflict, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";
import { APP_ID } from "@/lib/rbac/registry";
import { z } from "zod";

const cloneSchema = z.object({
  name: z.string().min(2).max(100).regex(/^[a-z][a-z0-9_]*$/, "lowercase alphanumeric + underscore"),
  description: z.string().max(500).optional(),
});

/** POST /api/v1/hrms/settings/roles/:id/clone — duplicate role with its permissions. */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const source = await prisma.hrmsAppRole.findFirst({
      where: { id: params.id, orgId: orgId, appId: APP_ID },
      include: {
        permissions: { select: { resource: true, action: true } },
        navigations: { select: { navKey: true } },
      },
    });
    if (!source) return notFound("Role not found");

    const body = await req.json();
    const parsed = cloneSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const existing = await prisma.hrmsAppRole.findFirst({
      where: { orgId: orgId, appId: APP_ID, name: parsed.data.name },
    });
    if (existing) return conflict("Role with this name already exists");

    const clone = await prisma.hrmsAppRole.create({
      data: {
        orgId: orgId,
        appId: APP_ID,
        name: parsed.data.name,
        description: parsed.data.description ?? `Cloned from ${source.name}`,
        isSystem: false,
        isDefault: false,
        createdBy: userId,
        permissions: source.permissions.length > 0
          ? { create: source.permissions.map((p) => ({ resource: p.resource, action: p.action })) }
          : undefined,
        navigations: source.navigations.length > 0
          ? { create: source.navigations.map((n) => ({ navKey: n.navKey })) }
          : undefined,
      },
      include: { permissions: { select: { resource: true, action: true } } },
    });

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "AppRole", entityId: clone.id,
      metadata: { clonedFrom: source.id, name: clone.name },
    });

    return successResponse(clone, undefined, 201);
  } catch (error) {
    console.error("POST /settings/roles/:id/clone error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.rbac.manage"] });
