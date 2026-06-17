import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

export const DELETE = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const existing = await prisma.emailTemplate.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Template not found");
    await prisma.emailTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    await createAuditLog({
      orgId, userId, action: "Delete", entityType: "EmailTemplate", entityId: id, request: req,
    });
    return successResponse({ id, deleted: true });
  } catch (e) {
    console.error("DELETE /settings/email-templates/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
