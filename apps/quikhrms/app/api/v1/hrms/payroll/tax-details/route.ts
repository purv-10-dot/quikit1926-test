import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { updateTaxDetailsSchema } from "@/lib/validations/payroll";
import { markStepCompleted } from "@/lib/services/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const details = await prisma.payrollTaxDetails.findUnique({ where: { orgId } });
    return successResponse(details);
  } catch (e) {
    console.error("GET /payroll/tax-details error:", e);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = updateTaxDetailsSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const data = parsed.data;
    const record = await prisma.payrollTaxDetails.upsert({
      where: { orgId },
      update: { ...data, updatedBy: userId },
      create: { orgId, ...data, createdBy: userId, updatedBy: userId },
    });
    if (data.pan) await markStepCompleted(orgId, userId, "taxDetailsCompleted");
    await createAuditLog({
      orgId, userId, action: "Update", entityType: "PayrollTaxDetails", entityId: record.id, changes: data,
    });
    return successResponse(record);
  } catch (e) {
    console.error("PUT /payroll/tax-details error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
