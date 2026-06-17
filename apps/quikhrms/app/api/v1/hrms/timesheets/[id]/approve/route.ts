import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { approveTimesheetSchema } from "@/lib/validations/gap-fill";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json();
    const parsed = approveTimesheetSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const sheet = await prisma.timesheet.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!sheet) return notFound("Timesheet not found");
    if (sheet.status !== "TsSubmitted") return conflict("Only submitted timesheets can be approved");

    const isApprove = parsed.data.action === "Approve";

    const updated = await prisma.timesheet.update({
      where: { id: params.id },
      data: {
        status: isApprove ? "TsApproved" : "TsRejected",
        approvedBy: isApprove ? userId : null,
        approvedAt: isApprove ? new Date() : null,
        rejectionReason: isApprove ? null : parsed.data.rejectionReason,
        updatedBy: userId,
      },
    });

    await prisma.timeLog.updateMany({
      where: { timesheetId: params.id },
      data: { status: isApprove ? "LogApproved" : "LogRejected" },
    });

    await createAuditLog({
      orgId, userId, action: isApprove ? "Approve" : "Reject",
      entityType: "Timesheet", entityId: params.id,
    });

    return successResponse(updated);
  } catch (error) {
    console.error("POST /timesheets/[id]/approve error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.attendance.approve"] });
