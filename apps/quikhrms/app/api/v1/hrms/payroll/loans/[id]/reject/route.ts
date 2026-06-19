import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound, validationError } from "@/lib/api-response";
import { rejectLoanSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const parsed = rejectLoanSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const loan = await prisma.employeeLoan.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!loan) return notFound();
    if (loan.status !== "Pending") return validationError("Only Pending loans can be rejected");

    const updated = await prisma.employeeLoan.update({
      where: { id },
      data: { status: "Rejected", rejectionReason: parsed.data.rejectionReason, updatedBy: userId },
    });
    await createAuditLog({ orgId, userId, action: "Reject", entityType: "EmployeeLoan", entityId: id, changes: parsed.data });
    return successResponse(updated);
  } catch (e) {
    console.error("POST /payroll/loans/[id]/reject error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
