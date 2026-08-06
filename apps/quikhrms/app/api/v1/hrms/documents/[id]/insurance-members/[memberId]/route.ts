import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

/** DELETE /api/v1/hrms/documents/[id]/insurance-members/[memberId] — remove an employee from this policy. */
export const DELETE = withAuth(async (_req: NextRequest, ctx, params) => {
  try {
    const { orgId, userId } = ctx;
    const { id, memberId } = params as { id: string; memberId: string };

    const member = await prisma.insurancePolicyMember.findFirst({ where: { id: memberId, orgId, documentId: id } });
    if (!member) return notFound("Enrollment not found");

    await prisma.insurancePolicyMember.delete({ where: { id: memberId } });

    await createAuditLog({
      orgId, userId, action: "Delete", entityType: "InsurancePolicyMember", entityId: memberId,
      metadata: { documentId: id, employeeId: member.employeeId },
    });

    return successResponse({ id: memberId, deleted: true });
  } catch (error) {
    console.error("DELETE /documents/[id]/insurance-members/[memberId] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.document.write", "hrms.document.write_self"], anyPermission: true });
