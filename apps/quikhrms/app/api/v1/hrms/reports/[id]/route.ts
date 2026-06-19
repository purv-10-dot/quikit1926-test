import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const report = await prisma.report.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!report) return notFound("Report not found");
    return successResponse(report);
  } catch (error) {
    console.error("GET /reports/[id] error:", error);
    return internalError();
  }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.report.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Report not found");

    await prisma.report.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });

    return successResponse({ id: params.id, deleted: true });
  } catch (error) {
    console.error("DELETE /reports/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.reports.manage"] });
