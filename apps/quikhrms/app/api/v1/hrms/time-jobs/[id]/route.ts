import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const job = await prisma.timeJob.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!job) return notFound("Job not found");
    await prisma.timeJob.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    await createAuditLog({ orgId, userId, action: "Delete", entityType: "TimeJob", entityId: params.id });
    return successResponse({ id: params.id, deleted: true });
  } catch (error) {
    console.error("DELETE /time-jobs/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.attendance.manage"] });
