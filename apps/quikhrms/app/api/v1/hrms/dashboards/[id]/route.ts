import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { updateDashboardSchema } from "@/lib/validations/notifications-reports";
import { createAuditLog } from "@/lib/utils/audit";
import { DASHBOARD_TEMPLATES } from "@/lib/services/dashboard-templates";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const dashboard = await prisma.dashboard.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!dashboard) return notFound("Dashboard not found");

    // Pre-built dashboards always reflect the latest Quikit-designed layout.
    // We keep the stored row (for ownership/ids) but swap in the current
    // template's widget set + description so design updates land immediately
    // without re-seeding. User-created dashboards are returned as-is.
    if (dashboard.isPrebuilt && dashboard.category) {
      const template = DASHBOARD_TEMPLATES.find((t) => t.category === dashboard.category);
      if (template) {
        return successResponse({
          ...dashboard,
          description: template.description,
          widgets: template.widgets,
        });
      }
    }

    return successResponse(dashboard);
  } catch (error) {
    console.error("GET /dashboards/[id] error:", error);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const body = await req.json();
    const parsed = updateDashboardSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const existing = await prisma.dashboard.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Dashboard not found");

    const { widgets, roleAccess, ...rest } = parsed.data;

    const dashboard = await prisma.dashboard.update({
      where: { id },
      data: {
        ...rest,
        ...(widgets && { widgets: JSON.parse(JSON.stringify(widgets)) }),
        ...(roleAccess !== undefined && { roleAccess: roleAccess ? JSON.parse(JSON.stringify(roleAccess)) : undefined }),
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Update", entityType: "Dashboard", entityId: id });
    return successResponse(dashboard);
  } catch (error) {
    console.error("PUT /dashboards/[id] error:", error);
    return internalError();
  }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.dashboard.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Dashboard not found");

    await prisma.dashboard.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    return successResponse({ id: params.id, deleted: true });
  } catch (error) {
    console.error("DELETE /dashboards/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
