import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const employeeId = searchParams.get("employeeId") ?? userId;
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const result = await prisma.jobScheduleEntry.updateMany({
      where: {
        orgId, employeeId, deletedAt: null, status: "ScheduleDraft",
        ...(from || to ? {
          date: {
            ...(from && { gte: new Date(from) }),
            ...(to && { lte: new Date(to) }),
          },
        } : {}),
      },
      data: { status: "SchedulePublished", updatedBy: userId },
    });

    await createAuditLog({
      orgId, userId, action: "StatusChange", entityType: "JobScheduleEntry",
      metadata: { published: result.count, employeeId },
    });

    return successResponse({ published: result.count });
  } catch (error) {
    console.error("POST /job-schedule/publish error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.attendance.manage"] });
