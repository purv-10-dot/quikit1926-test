import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { updateEPFSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const cfg = await prisma.ePFConfig.findUnique({ where: { orgId } });
    return successResponse(cfg);
  } catch (e) {
    console.error("GET /payroll/statutory/epf error:", e);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = updateEPFSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const record = await prisma.ePFConfig.upsert({
      where: { orgId },
      update: { ...parsed.data, updatedBy: userId },
      create: { orgId, ...parsed.data, createdBy: userId, updatedBy: userId },
    });
    await createAuditLog({ orgId, userId, action: "Update", entityType: "EPFConfig", entityId: record.id, changes: parsed.data });
    // Step completion is computed dynamically in computeSetupProgress — saving EPF alone is not enough.
    return successResponse(record);
  } catch (e) {
    console.error("PUT /payroll/statutory/epf error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
