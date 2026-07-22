import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { updateOnboardingTemplateSchema } from "@/lib/validations/boarding";
import { createAuditLog } from "@/lib/utils/audit";

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const body = await req.json();
    const parsed = updateOnboardingTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const existing = await prisma.onboardingTemplate.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Template not found");

    const d = parsed.data;
    const updated = await prisma.onboardingTemplate.update({
      where: { id },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.description !== undefined && { description: d.description }),
        ...(d.departmentId !== undefined && { departmentId: d.departmentId }),
        ...(d.designationId !== undefined && { designationId: d.designationId }),
        ...(d.tasks !== undefined && { tasks: JSON.parse(JSON.stringify(d.tasks)) }),
        ...(d.isActive !== undefined && { isActive: d.isActive }),
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Update", entityType: "OnboardingTemplate", entityId: id, changes: d });
    return successResponse(updated);
  } catch (error) {
    console.error("PUT /onboarding/templates/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const existing = await prisma.onboardingTemplate.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Template not found");

    // Soft delete — keep the row for audit history and any records that reference it.
    await prisma.onboardingTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: userId },
    });

    await createAuditLog({ orgId, userId, action: "Delete", entityType: "OnboardingTemplate", entityId: id });
    return successResponse({ id, deleted: true });
  } catch (error) {
    console.error("DELETE /onboarding/templates/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });
