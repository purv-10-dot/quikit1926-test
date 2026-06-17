import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound, validationError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

// Resume a paused loan early by clearing the hold; EMIs deduct again from the next pay run.
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const loan = await prisma.employeeLoan.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!loan) return notFound();
    if (!loan.holdUntil) return validationError("Loan is not on hold");

    const updated = await prisma.employeeLoan.update({
      where: { id },
      data: { holdUntil: null, updatedBy: userId },
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "EmployeeLoan", entityId: id,
      changes: { resumed: true },
    });
    return successResponse(updated);
  } catch (e) {
    console.error("POST /payroll/loans/[id]/resume error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
