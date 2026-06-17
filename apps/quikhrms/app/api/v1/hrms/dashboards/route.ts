import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createDashboardSchema } from "@/lib/validations/notifications-reports";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const dashboards = await prisma.dashboard.findMany({
      where: { orgId, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    return successResponse(dashboards);
  } catch (error) {
    console.error("GET /dashboards error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createDashboardSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    if (parsed.data.isDefault) {
      await prisma.dashboard.updateMany({
        where: { orgId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const dashboard = await prisma.dashboard.create({
      data: {
        orgId,
        name: parsed.data.name,
        description: parsed.data.description,
        widgets: JSON.parse(JSON.stringify(parsed.data.widgets)),
        roleAccess: parsed.data.roleAccess ? JSON.parse(JSON.stringify(parsed.data.roleAccess)) : undefined,
        isDefault: parsed.data.isDefault,
        isPublic: parsed.data.isPublic,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Create", entityType: "Dashboard", entityId: dashboard.id });
    return successResponse(dashboard, undefined, 201);
  } catch (error) {
    console.error("POST /dashboards error:", error);
    return internalError();
  }
});
