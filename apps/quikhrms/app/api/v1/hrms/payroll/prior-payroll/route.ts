import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { updatePriorPayrollSchema } from "@/lib/validations/payroll";
import { markStepCompleted } from "@/lib/services/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const [prior, schedule] = await Promise.all([
      prisma.priorPayroll.findUnique({ where: { orgId } }),
      prisma.paySchedule.findUnique({ where: { orgId }, select: { id: true } }),
    ]);
    return successResponse({ prior, paySchedulePresent: !!schedule });
  } catch (e) {
    console.error("GET /payroll/prior-payroll error:", e);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = updatePriorPayrollSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const { fromMonth, toMonth, ...rest } = parsed.data;
    const data = {
      ...rest,
      fromMonth: fromMonth ? new Date(fromMonth) : null,
      toMonth: toMonth ? new Date(toMonth) : null,
    };
    const record = await prisma.priorPayroll.upsert({
      where: { orgId },
      update: { ...data, updatedBy: userId },
      create: { orgId, ...data, createdBy: userId, updatedBy: userId },
    });
    await markStepCompleted(orgId, userId, "priorPayrollCompleted");
    await createAuditLog({ orgId, userId, action: "Update", entityType: "PriorPayroll", entityId: record.id, changes: parsed.data });
    return successResponse(record);
  } catch (e) {
    console.error("PUT /payroll/prior-payroll error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
