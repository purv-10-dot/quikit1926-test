import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { updateClaimsDeclarationSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const [settings, fbpCount, reimbCount] = await Promise.all([
      prisma.claimsDeclarationSettings.findUnique({ where: { orgId } }),
      prisma.salaryComponent.count({
        where: { orgId, deletedAt: null, type: "Reimbursement", isFBP: true, isActive: true },
      }),
      prisma.salaryComponent.count({
        where: { orgId, deletedAt: null, type: "Reimbursement", isActive: true },
      }),
    ]);
    return successResponse({
      settings: settings ?? null,
      hasActiveFBP: fbpCount > 0,
      hasActiveReimbursement: reimbCount > 0,
    });
  } catch (e) {
    console.error("GET /payroll/claims-declarations error:", e);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = updateClaimsDeclarationSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }
    const data = { ...parsed.data } as Record<string, unknown>;

    if (parsed.data.itDeclarationReleased === true) {
      data.itDeclarationReleasedAt = new Date();
    } else if (parsed.data.itDeclarationReleased === false) {
      data.itDeclarationReleasedAt = null;
    }
    if (parsed.data.poiReleased === true) {
      data.poiReleasedAt = new Date();
    } else if (parsed.data.poiReleased === false) {
      data.poiReleasedAt = null;
    }

    const record = await prisma.claimsDeclarationSettings.upsert({
      where: { orgId },
      update: { ...data, updatedBy: userId },
      create: { orgId, ...data, createdBy: userId, updatedBy: userId },
    });
    await createAuditLog({ orgId, userId, action: "Update", entityType: "ClaimsDeclarationSettings", entityId: record.id, changes: parsed.data });
    return successResponse(record);
  } catch (e) {
    console.error("PUT /payroll/claims-declarations error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
