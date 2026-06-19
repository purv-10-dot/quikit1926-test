import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const p = await prisma.timeProject.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: { jobs: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } } },
    });
    if (!p) return notFound("Project not found");
    return successResponse(p);
  } catch (error) {
    console.error("GET /time-projects/[id] error:", error);
    return internalError();
  }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const p = await prisma.timeProject.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!p) return notFound("Project not found");
    await prisma.timeProject.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    await createAuditLog({ orgId, userId, action: "Delete", entityType: "TimeProject", entityId: params.id });
    return successResponse({ id: params.id, deleted: true });
  } catch (error) {
    console.error("DELETE /time-projects/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.attendance.manage"] });
