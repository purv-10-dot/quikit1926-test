import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { updatePayScheduleSchema } from "@/lib/validations/payroll";
import { markStepCompleted } from "@/lib/services/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const sched = await prisma.paySchedule.findUnique({ where: { orgId } });
    return successResponse(sched);
  } catch (e) {
    console.error("GET /payroll/pay-schedule error:", e);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = updatePayScheduleSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const { firstPayrollMonth, ...rest } = parsed.data;
    const data = {
      ...rest,
      firstPayrollMonth: firstPayrollMonth ? new Date(firstPayrollMonth) : null,
    };
    const record = await prisma.paySchedule.upsert({
      where: { orgId },
      update: { ...data, updatedBy: userId },
      create: { orgId, ...data, createdBy: userId, updatedBy: userId },
    });
    await markStepCompleted(orgId, userId, "payScheduleCompleted");
    await createAuditLog({
      orgId, userId, action: "Update", entityType: "PaySchedule", entityId: record.id, changes: data,
    });
    return successResponse(record);
  } catch (e) {
    console.error("PUT /payroll/pay-schedule error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
