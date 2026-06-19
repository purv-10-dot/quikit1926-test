import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { approveOneTimeEarningSchema } from "@/lib/validations/payroll";
import { createAuditLog } from "@/lib/utils/audit";

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const existing = await prisma.oneTimeEarning.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Record not found");
    if (existing.status === "Applied") return validationError("Cannot modify after applied to payroll");

    const body = await req.json();
    const parsed = approveOneTimeEarningSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const updated = await prisma.oneTimeEarning.update({
      where: { id },
      data: {
        status: parsed.data.status,
        rejectionReason: parsed.data.status === "Rejected" ? parsed.data.rejectionReason ?? null : null,
        approvedBy: userId,
        approvedAt: new Date(),
        updatedBy: userId,
      },
    });
    await createAuditLog({
      orgId, userId,
      action: parsed.data.status === "Approved" ? "Approve" : "Reject",
      entityType: "OneTimeEarning", entityId: id, changes: parsed.data,
      request: req,
    });
    return successResponse(updated);
  } catch (e) {
    console.error("PATCH /payroll/one-time-earnings/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

export const DELETE = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const existing = await prisma.oneTimeEarning.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Record not found");
    if (existing.status === "Applied") return validationError("Cannot delete after applied to payroll");

    await prisma.oneTimeEarning.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    await createAuditLog({
      orgId, userId, action: "Delete",
      entityType: "OneTimeEarning", entityId: id,
      request: req,
    });
    return successResponse({ id, deleted: true });
  } catch (e) {
    console.error("DELETE /payroll/one-time-earnings/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
