import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound, validationError } from "@/lib/api-response";
import { updateLoanSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }, { id }) => {
  try {
    const loan = await prisma.employeeLoan.findFirst({
      where: { id, orgId, deletedAt: null },
      include: { repayments: { orderBy: { emiNumber: "asc" } } },
    });
    if (!loan) return notFound();
    const employee = await prisma.employee.findFirst({
      where: { id: loan.employeeId, orgId, deletedAt: null },
      select: { id: true, employeeCode: true, firstName: true, lastName: true, workEmail: true, department: { select: { name: true } } },
    });
    return successResponse({ ...loan, employee });
  } catch (e) {
    console.error("GET /payroll/loans/[id] error:", e);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const parsed = updateLoanSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const loan = await prisma.employeeLoan.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!loan) return notFound();
    if (loan.status !== "Pending") return validationError("Only Pending loans can be edited");

    const d = parsed.data;
    const updated = await prisma.employeeLoan.update({
      where: { id },
      data: {
        ...(d.loanType ? { loanType: d.loanType } : {}),
        ...(d.principalAmount ? { principalAmount: d.principalAmount, outstandingAmount: d.principalAmount } : {}),
        ...(d.interestRate != null ? { interestRate: d.interestRate } : {}),
        ...(d.tenureMonths ? { tenureMonths: d.tenureMonths } : {}),
        ...(d.emiAmount ? { emiAmount: d.emiAmount } : {}),
        ...(d.startDate ? { startDate: new Date(d.startDate) } : {}),
        ...(d.reason !== undefined ? { reason: d.reason } : {}),
        updatedBy: userId,
      },
    });
    await createAuditLog({ orgId, userId, action: "Update", entityType: "EmployeeLoan", entityId: id, changes: d });
    return successResponse(updated);
  } catch (e) {
    console.error("PUT /payroll/loans/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const loan = await prisma.employeeLoan.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!loan) return notFound();
    if (loan.status === "Disbursed" || loan.status === "Closed") return validationError("Cannot delete disbursed/closed loan");

    await prisma.employeeLoan.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    await createAuditLog({ orgId, userId, action: "Delete", entityType: "EmployeeLoan", entityId: id });
    return successResponse({ id });
  } catch (e) {
    console.error("DELETE /payroll/loans/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
