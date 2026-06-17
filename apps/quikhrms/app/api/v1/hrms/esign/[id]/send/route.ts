import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, conflict, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.eSignRequest.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("E-sign request not found");
    if (existing.status !== "ESignDraft") return conflict("Only drafts can be sent");

    const updated = await prisma.eSignRequest.update({
      where: { id: params.id },
      data: { status: "ESignSent", sentAt: new Date(), updatedBy: userId },
    });

    await createAuditLog({ orgId, userId, action: "StatusChange", entityType: "ESignRequest", entityId: params.id, metadata: { to: "ESignSent" } });
    return successResponse(updated);
  } catch (error) {
    console.error("POST /esign/[id]/send error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.document.write"] });
