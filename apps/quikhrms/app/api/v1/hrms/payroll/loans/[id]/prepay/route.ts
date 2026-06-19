import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound, validationError } from "@/lib/api-response";
import { prepayLoanSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

// Lump-sum prepayment: employee pays part or all of the remaining balance early.
// Records a manual LoanRepayment, reduces the outstanding, and auto-closes on full payoff.
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const parsed = prepayLoanSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const loan = await prisma.employeeLoan.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!loan) return notFound();
    if (loan.status !== "Disbursed") return validationError("Only disbursed loans can be prepaid");

    const outstanding = Number(loan.outstandingAmount);
    if (outstanding <= 0) return validationError("Loan has no outstanding balance");

    const amount = Math.round(parsed.data.amount);
    if (amount > outstanding) return validationError(`Amount exceeds outstanding balance of ₹${outstanding}`);

    const newOutstanding = Math.max(0, outstanding - amount);
    const repaymentCount = await prisma.loanRepayment.count({ where: { orgId, loanId: id } });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.loanRepayment.create({
        data: {
          orgId,
          loanId: id,
          amount,
          repaidOn: new Date(),
          emiNumber: repaymentCount + 1,
          isManual: true,
          notes: parsed.data.note?.trim() || "Lump-sum prepayment",
        },
      });
      return tx.employeeLoan.update({
        where: { id },
        data: {
          outstandingAmount: newOutstanding,
          ...(newOutstanding <= 0 ? { status: "Closed", closedAt: new Date() } : {}),
          updatedBy: userId,
        },
      });
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "EmployeeLoan", entityId: id,
      changes: { prepayment: amount, newOutstanding, closed: newOutstanding <= 0 },
    });
    return successResponse(updated);
  } catch (e) {
    console.error("POST /payroll/loans/[id]/prepay error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
