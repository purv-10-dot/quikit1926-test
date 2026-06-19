import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, conflict, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const sheet = await prisma.timesheet.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!sheet) return notFound("Timesheet not found");
    if (sheet.status !== "TsDraft") return conflict("Only draft timesheets can be submitted");

    const updated = await prisma.timesheet.update({
      where: { id: params.id },
      data: { status: "TsSubmitted", submittedAt: new Date(), updatedBy: userId },
    });

    await prisma.timeLog.updateMany({
      where: { timesheetId: params.id },
      data: { status: "LogSubmitted" },
    });

    await createAuditLog({ orgId, userId, action: "StatusChange", entityType: "Timesheet", entityId: params.id, metadata: { to: "TsSubmitted" } });
    return successResponse(updated);
  } catch (error) {
    console.error("POST /timesheets/[id]/submit error:", error);
    return internalError();
  }
});
