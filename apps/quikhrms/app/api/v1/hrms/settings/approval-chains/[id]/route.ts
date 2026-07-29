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
}, { requiredPermissions: ["hrms.settings.write", "hrms.settings.read"], anyPermission: true });

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

    // Same org-membership validation as POST: every USER/ROLE approver referenced
    // in the levels must belong to this org (block cross-tenant / bogus ids).
    if (levels && levels.length) {
      const levelUserIds = [...new Set(levels.filter((l) => l.kind === "USER" && l.userId).map((l) => l.userId as string))];
      const levelRoleIds = [...new Set(levels.filter((l) => l.kind === "ROLE" && l.roleId).map((l) => l.roleId as string))];
      if (levelUserIds.length) {
        const n = await prisma.employee.count({ where: { orgId, deletedAt: null, id: { in: levelUserIds } } });
        if (n !== levelUserIds.length) return validationError("One or more approvers aren't valid employees in your organisation.");
      }
      if (levelRoleIds.length) {
        const n = await prisma.hrmsAppRole.count({ where: { orgId, id: { in: levelRoleIds } } });
        if (n !== levelRoleIds.length) return validationError("One or more approver roles are invalid.");
      }
    }

    // Only one active chain per module. Activating this chain deactivates any
    // other active chain for the same module.
    const chain = await prisma.$transaction(async (tx) => {
      const updated = await tx.approvalChain.update({
        where: { id },
        data: {
          ...rest,
          ...(levels && { levels: JSON.parse(JSON.stringify(levels)) }),
          updatedBy: userId,
        },
      });
      if (updated.isActive) {
        await tx.approvalChain.updateMany({
          where: { orgId, module: updated.module, isActive: true, deletedAt: null, id: { not: id } },
          data: { isActive: false, updatedBy: userId },
        });
      }
      return updated;
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
