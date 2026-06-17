import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound, validationError } from "@/lib/api-response";
import { holdLoanSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

// Pause EMI auto-deduction for 1-3 months. Extends the hold window if one is already
// active, pushes endDate out by the same span, and leaves status as Disbursed so the
// loan auto-resumes once holdUntil passes (see payroll-compute loan query).
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const parsed = holdLoanSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const loan = await prisma.employeeLoan.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!loan) return notFound();
    if (loan.status !== "Disbursed") return validationError("Only disbursed loans can be paused");
    if (Number(loan.outstandingAmount) <= 0) return validationError("Loan has no outstanding balance");

    const { months } = parsed.data;
    const now = new Date();
    const base = loan.holdUntil && loan.holdUntil > now ? new Date(loan.holdUntil) : now;
    const holdUntil = new Date(base);
    holdUntil.setMonth(holdUntil.getMonth() + months);

    const endDate = loan.endDate ? new Date(loan.endDate) : null;
    if (endDate) endDate.setMonth(endDate.getMonth() + months);

    const updated = await prisma.employeeLoan.update({
      where: { id },
      data: { holdUntil, ...(endDate ? { endDate } : {}), updatedBy: userId },
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "EmployeeLoan", entityId: id,
      changes: { pausedMonths: months, holdUntil, note: parsed.data.note ?? null },
    });
    return successResponse(updated);
  } catch (e) {
    console.error("POST /payroll/loans/[id]/hold error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
