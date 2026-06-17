import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { approveReimbursementClaimSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * Returns the 1st of next month UTC — the standard payPeriod key used by
 * OneTimeEarning so payroll-compute picks it up on the next monthly run.
 */
function nextPayPeriodStart(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const parsed = approveReimbursementClaimSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const existing = await prisma.reimbursementClaim.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound();
    if (existing.status !== "Submitted") return validationError("Only Submitted claims can be approved");

    // Mark approved + auto-queue the approved amount onto next month's payslip
    // via a OneTimeEarning row. Reimbursements are non-taxable cash add-ons,
    // not subject to EPF / ESI / PT. payroll-compute already reads pending
    // OneTimeEarnings for the run's period.
    const payPeriod = nextPayPeriodStart();
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.reimbursementClaim.update({
        where: { id },
        data: {
          amountApproved: parsed.data.amountApproved,
          status: "Approved",
          approvedBy: userId,
          approvedAt: new Date(),
          updatedBy: userId,
        },
      });

      const oneTime = await tx.oneTimeEarning.create({
        data: {
          orgId,
          employeeId: existing.employeeId,
          kind: "Other",
          category: "OtherReimbursement",
          componentCode: `REIMB-${existing.id.slice(-8).toUpperCase()}`,
          componentName: existing.componentName,
          amount: parsed.data.amountApproved,
          payPeriod,
          taxable: false,
          considerForEPF: false,
          considerForESI: false,
          considerForPT: false,
          reason: `Reimbursement claim ${existing.title ?? existing.componentName} (${existing.id})`,
          sourceReimbursementClaimId: existing.id,
          status: "Approved",
          approvedBy: userId,
          approvedAt: new Date(),
          createdBy: userId,
          updatedBy: userId,
        },
      });

      return { updated, oneTime };
    });

    await createAuditLog({
      orgId, userId, action: "Approve",
      entityType: "ReimbursementClaim", entityId: id,
      before: {
        status: existing.status,
        amountApproved: existing.amountApproved != null ? Number(existing.amountApproved) : null,
      },
      after: {
        status: "Approved",
        amountApproved: parsed.data.amountApproved,
      },
      metadata: { oneTimeEarningId: result.oneTime.id, payPeriod: payPeriod.toISOString().slice(0, 10) },
      request: req,
    });
    return successResponse(result.updated);
  } catch (e) {
    console.error("POST /payroll/approvals/reimbursements/[id]/approve error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
