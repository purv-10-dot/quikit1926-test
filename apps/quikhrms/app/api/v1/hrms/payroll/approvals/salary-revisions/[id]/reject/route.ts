import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound, validationError } from "@/lib/api-response";
import { rejectSalaryRevisionSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";
import { buildPayrollEvent, emitPayrollEvent, PAYROLL_EVENTS } from "@/lib/events/payroll";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const parsed = rejectSalaryRevisionSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const revision = await prisma.salaryRevision.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!revision) return notFound();
    if (revision.status !== "Pending") return validationError("Only Pending revisions can be rejected");

    const record = await prisma.salaryRevision.update({
      where: { id },
      data: { status: "Rejected", rejectionReason: parsed.data.rejectionReason, updatedBy: userId },
    });
    await createAuditLog({ orgId, userId, action: "Reject", entityType: "SalaryRevision", entityId: id, changes: parsed.data });
    emitPayrollEvent(buildPayrollEvent(PAYROLL_EVENTS.REVISION_REJECTED, orgId, userId, id, {
      employeeId: revision.employeeId,
      reason: parsed.data.rejectionReason,
    }));
    return successResponse(record);
  } catch (e) {
    console.error("POST /payroll/approvals/salary-revisions/[id]/reject error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
