import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound, validationError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const loan = await prisma.employeeLoan.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!loan) return notFound();
    if (loan.status !== "Pending") return validationError("Only Pending loans can be approved");

    const updated = await prisma.employeeLoan.update({
      where: { id },
      data: { status: "Approved", approvedBy: userId, approvedAt: new Date(), updatedBy: userId },
    });
    await createAuditLog({ orgId, userId, action: "Approve", entityType: "EmployeeLoan", entityId: id });
    return successResponse(updated);
  } catch (e) {
    console.error("POST /payroll/loans/[id]/approve error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
