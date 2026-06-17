import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { verifyDonationSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const body = await req.json();
    const parsed = verifyDonationSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const existing = await prisma.donation.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound();

    const record = await prisma.donation.update({
      where: { id },
      data: {
        status: parsed.data.status,
        rejectionReason: parsed.data.rejectionReason ?? null,
        verifiedBy: userId,
        verifiedAt: new Date(),
        updatedBy: userId,
      },
    });
    await createAuditLog({
      orgId, userId,
      action: parsed.data.status === "Verified" ? "Approve" : "Reject",
      entityType: "Donation", entityId: id, changes: parsed.data,
    });
    return successResponse(record);
  } catch (e) {
    console.error("POST /payroll/giving/[id]/verify error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
