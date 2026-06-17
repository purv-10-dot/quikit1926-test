import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const loan = await prisma.employeeLoan.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!loan) return notFound();

    const updated = await prisma.employeeLoan.update({
      where: { id },
      data: { status: "Closed", closedAt: new Date(), outstandingAmount: 0, updatedBy: userId },
    });
    await createAuditLog({ orgId, userId, action: "StatusChange", entityType: "EmployeeLoan", entityId: id, changes: { to: "Closed" } });
    return successResponse(updated);
  } catch (e) {
    console.error("POST /payroll/loans/[id]/close error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
