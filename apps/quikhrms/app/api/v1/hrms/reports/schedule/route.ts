import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { scheduleReportSchema } from "@/lib/validations/notifications-reports";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = scheduleReportSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const report = await prisma.report.create({
      data: {
        orgId,
        name: parsed.data.name,
        type: parsed.data.type,
        format: parsed.data.format,
        scheduleCron: parsed.data.scheduleCron,
        parameters: parsed.data.parameters ? JSON.parse(JSON.stringify({ ...parsed.data.parameters, recipients: parsed.data.recipients })) : { recipients: parsed.data.recipients },
        generatedBy: userId,
        status: "ReportQueued",
        createdBy: userId,
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Create", entityType: "Report", entityId: report.id, metadata: { scheduled: true } });
    return successResponse(report, undefined, 201);
  } catch (error) {
    console.error("POST /reports/schedule error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.reports.read"] });
