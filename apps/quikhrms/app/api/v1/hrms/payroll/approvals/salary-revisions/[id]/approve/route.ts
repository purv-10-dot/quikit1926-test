import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound, validationError } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";
import { buildPayrollEvent, emitPayrollEvent, PAYROLL_EVENTS } from "@/lib/events/payroll";

export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const revision = await prisma.salaryRevision.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!revision) return notFound();
    if (revision.status !== "Pending") return validationError("Only Pending revisions can be approved");

    const result = await prisma.$transaction(async (tx) => {
      // Deactivate current salaries
      await tx.employeeSalary.updateMany({
        where: { orgId, employeeId: revision.employeeId, deletedAt: null, isActive: true },
        data: { isActive: false, effectiveTo: revision.effectiveFrom },
      });
      const newSalary = await tx.employeeSalary.create({
        data: {
          orgId,
          employeeId: revision.employeeId,
          structureId: revision.structureId,
          ctc: revision.proposedCTC,
          effectiveFrom: revision.effectiveFrom,
          revisionReason: revision.reason,
          isActive: true,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      const updatedRevision = await tx.salaryRevision.update({
        where: { id },
        data: {
          status: "Approved",
          approvedBy: userId,
          approvedAt: new Date(),
          appliedSalaryId: newSalary.id,
          updatedBy: userId,
        },
      });
      return { revision: updatedRevision, newSalary };
    });

    await createAuditLog({ orgId, userId, action: "Approve", entityType: "SalaryRevision", entityId: id });
    emitPayrollEvent(buildPayrollEvent(PAYROLL_EVENTS.REVISION_APPROVED, orgId, userId, id, {
      employeeId: revision.employeeId,
      previousCTC: Number(revision.currentCTC),
      newCTC: Number(revision.proposedCTC),
      effectiveFrom: revision.effectiveFrom,
    }));
    emitPayrollEvent(buildPayrollEvent(PAYROLL_EVENTS.SALARY_REVISED, orgId, userId, result.newSalary.id, {
      employeeId: revision.employeeId,
      ctc: Number(revision.proposedCTC),
    }));
    return successResponse(result);
  } catch (e) {
    console.error("POST /payroll/approvals/salary-revisions/[id]/approve error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
