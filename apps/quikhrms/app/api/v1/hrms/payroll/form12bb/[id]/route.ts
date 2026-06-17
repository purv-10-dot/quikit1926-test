import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { createAuditLog } from "@/lib/utils/audit";

const STATUSES = ["Submitted", "Verified", "Rejected"] as const;

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const existing = await prisma.form12BBDeclaration.findFirst({
      where: { id, orgId, deletedAt: null },
    });
    if (!existing) return notFound();

    const body = await req.json();
    const status = body.status;
    if (!STATUSES.includes(status)) return validationError("Invalid status");

    const updated = await prisma.form12BBDeclaration.update({
      where: { id },
      data: { status, updatedBy: userId },
    });
    await createAuditLog({
      orgId, userId, action: "StatusChange", entityType: "Form12BBDeclaration", entityId: id,
      changes: { status }, request: req,
    });
    return successResponse(updated);
  } catch (e) {
    console.error("PATCH /payroll/form12bb/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
