import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound, validationError } from "@/lib/api-response";
import { waiveLoanSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

// Waive 1-3 EMI installments: forgives the equivalent amount of the outstanding balance.
// Records a manual LoanRepayment (write-off), advances emisPaid, and auto-closes if cleared.
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const parsed = waiveLoanSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const loan = await prisma.employeeLoan.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!loan) return notFound();
    if (loan.status !== "Disbursed") return validationError("Only disbursed loans can have EMIs waived");

    const outstanding = Number(loan.outstandingAmount);
    if (outstanding <= 0) return validationError("Loan has no outstanding balance");

    const { emiCount } = parsed.data;
    const waiveAmount = Math.min(outstanding, Math.round(Number(loan.emiAmount) * emiCount));
    const newOutstanding = Math.max(0, outstanding - waiveAmount);
    const newEmisPaid = Math.min(loan.tenureMonths, loan.emisPaid + emiCount);
    const repaymentCount = await prisma.loanRepayment.count({ where: { orgId, loanId: id } });

    const updated = await prisma.$transaction(async (tx) => {
      await tx.loanRepayment.create({
        data: {
          orgId,
          loanId: id,
          amount: waiveAmount,
          repaidOn: new Date(),
          emiNumber: repaymentCount + 1,
          isManual: true,
          notes: `Waived ${emiCount} EMI(s)${parsed.data.note?.trim() ? `: ${parsed.data.note.trim()}` : ""}`,
        },
      });
      return tx.employeeLoan.update({
        where: { id },
        data: {
          outstandingAmount: newOutstanding,
          emisPaid: newEmisPaid,
          ...(newOutstanding <= 0 ? { status: "Closed", closedAt: new Date() } : {}),
          updatedBy: userId,
        },
      });
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "EmployeeLoan", entityId: id,
      changes: { waivedEmis: emiCount, waiveAmount, newOutstanding, closed: newOutstanding <= 0 },
    });
    return successResponse(updated);
  } catch (e) {
    console.error("POST /payroll/loans/[id]/waive error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
