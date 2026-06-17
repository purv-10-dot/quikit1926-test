import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound, validationError } from "@/lib/api-response";
import { disburseLoanSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const parsed = disburseLoanSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const loan = await prisma.employeeLoan.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!loan) return notFound();
    if (loan.status !== "Approved") return validationError("Only Approved loans can be disbursed");

    const disbursementDate = new Date(parsed.data.disbursementDate);
    const endDate = new Date(disbursementDate);
    endDate.setMonth(endDate.getMonth() + loan.tenureMonths);

    const updated = await prisma.employeeLoan.update({
      where: { id },
      data: { status: "Disbursed", disbursementDate, endDate, updatedBy: userId },
    });
    await createAuditLog({ orgId, userId, action: "StatusChange", entityType: "EmployeeLoan", entityId: id, changes: { to: "Disbursed" } });
    return successResponse(updated);
  } catch (e) {
    console.error("POST /payroll/loans/[id]/disburse error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
