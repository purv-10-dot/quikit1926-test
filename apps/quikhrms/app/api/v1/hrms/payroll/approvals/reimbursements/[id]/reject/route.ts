import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { rejectReimbursementClaimSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const parsed = rejectReimbursementClaimSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const existing = await prisma.reimbursementClaim.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound();
    if (existing.status !== "Submitted") return validationError("Only Submitted claims can be rejected");

    const record = await prisma.reimbursementClaim.update({
      where: { id },
      data: { status: "Rejected", rejectionReason: parsed.data.rejectionReason, updatedBy: userId },
    });
    await createAuditLog({
      orgId, userId, action: "Reject",
      entityType: "ReimbursementClaim", entityId: id,
      before: { status: existing.status, rejectionReason: existing.rejectionReason },
      after: { status: "Rejected", rejectionReason: parsed.data.rejectionReason },
      request: req,
    });
    return successResponse(record);
  } catch (e) {
    console.error("POST /payroll/approvals/reimbursements/[id]/reject error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
