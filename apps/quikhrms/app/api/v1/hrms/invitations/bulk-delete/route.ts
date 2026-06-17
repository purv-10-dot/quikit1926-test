import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * POST /api/v1/hrms/invitations/bulk-delete — soft-delete many invitations.
 * Body: { ids: string[] }. Removes the invitation records (any status) from
 * the list. Existing accepted-user accounts are not affected.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json().catch(() => null);
    const ids: unknown = body?.ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string")) {
      return validationError("Provide a non-empty array of invitation ids");
    }

    const result = await prisma.invitation.updateMany({
      where: { id: { in: ids as string[] }, orgId, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    await createAuditLog({
      orgId, userId, action: "Delete", entityType: "Invitation", entityId: "bulk",
      metadata: { action: "bulk-delete", requested: ids.length, deleted: result.count },
    });

    return successResponse({ deleted: result.count });
  } catch (error) {
    console.error("POST /invitations/bulk-delete error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.user.invite"] });
