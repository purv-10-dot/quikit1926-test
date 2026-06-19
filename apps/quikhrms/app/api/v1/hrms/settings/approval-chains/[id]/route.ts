import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { updateApprovalChainSchema } from "@/lib/validations/settings";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const chain = await prisma.approvalChain.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
    });
    if (!chain) return notFound("Approval chain not found");
    return successResponse(chain);
  } catch (error) {
    console.error("GET /settings/approval-chains/[id] error:", error);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const body = await req.json();
    const parsed = updateApprovalChainSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const existing = await prisma.approvalChain.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Approval chain not found");

    const { levels, ...rest } = parsed.data;

    const chain = await prisma.approvalChain.update({
      where: { id },
      data: {
        ...rest,
        ...(levels && { levels: JSON.parse(JSON.stringify(levels)) }),
        updatedBy: userId,
      },
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "ApprovalChain", entityId: id, changes: parsed.data,
    });

    return successResponse(chain);
  } catch (error) {
    console.error("PUT /settings/approval-chains/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const existing = await prisma.approvalChain.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Approval chain not found");

    await prisma.approvalChain.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: userId },
    });

    await createAuditLog({
      orgId, userId, action: "Delete", entityType: "ApprovalChain", entityId: id,
    });

    return successResponse({ id, deleted: true });
  } catch (error) {
    console.error("DELETE /settings/approval-chains/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
