import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, forbidden, internalError } from "@/lib/api-response";
import { scheduleReportSchema } from "@/lib/validations/notifications-reports";
import { createAuditLog } from "@/lib/utils/audit";

// Scheduled report type → permission needed to schedule it. Sensitive types map
// to the elevated permission; the rest need the base report permission.
const SCHEDULE_TYPE_PERMISSION: Record<string, string> = {
  Attrition: "hrms.reports.manage",
};

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, userId } = ctx;
    const body = await req.json();
    const parsed = scheduleReportSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    // Gate the scheduled report type by the same per-report permission model.
    const need = SCHEDULE_TYPE_PERMISSION[parsed.data.type] ?? "hrms.reports.read";
    if (!ctx.permissions.includes("*") && !ctx.permissions.includes(need)) {
      return forbidden(`You don't have permission to schedule this report (requires ${need}).`);
    }

    // Recipients must be employees in this org — never arbitrary external emails
    // (a scheduled export mails sensitive data on a cron).
    const recipients = parsed.data.recipients ?? [];
    if (recipients.length) {
      const found = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, workEmail: { in: recipients } },
        select: { workEmail: true },
      });
      const foundSet = new Set(found.map((e) => (e.workEmail ?? "").toLowerCase()));
      const invalid = recipients.filter((r) => !foundSet.has(r.toLowerCase()));
      if (invalid.length) {
        return validationError(`Recipients must be employees in your organization: ${invalid.slice(0, 5).join(", ")}`);
      }
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
