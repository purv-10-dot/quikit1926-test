import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { reviewInvestmentProofSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const parsed = reviewInvestmentProofSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const existing = await prisma.investmentProof.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound();

    const record = await prisma.investmentProof.update({
      where: { id },
      data: {
        approvedAmount: parsed.data.approvedAmount,
        status: parsed.data.status,
        rejectionReason: parsed.data.rejectionReason ?? null,
        reviewedBy: userId,
        reviewedAt: new Date(),
        updatedBy: userId,
      },
    });
    await createAuditLog({
      orgId, userId,
      action: parsed.data.status === "Approved" || parsed.data.status === "PartiallyApproved" ? "Approve" : "Reject",
      entityType: "InvestmentProof", entityId: id,
      before: {
        status: existing.status,
        approvedAmount: existing.approvedAmount != null ? Number(existing.approvedAmount) : null,
        rejectionReason: existing.rejectionReason,
      },
      after: {
        status: parsed.data.status,
        approvedAmount: parsed.data.approvedAmount,
        rejectionReason: parsed.data.rejectionReason ?? null,
      },
      request: req,
    });
    return successResponse(record);
  } catch (e) {
    console.error("POST /payroll/approvals/poi/[id]/review error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
