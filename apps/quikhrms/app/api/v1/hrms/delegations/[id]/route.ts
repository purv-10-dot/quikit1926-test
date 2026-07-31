import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, forbidden, internalError } from "@/lib/api-response";
import { updateDelegationSchema } from "@/lib/validations/gap-fill";
import { createAuditLog } from "@/lib/utils/audit";

export const PUT = withAuth(async (req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    const body = await req.json();
    const parsed = updateDelegationSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const existing = await prisma.delegation.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Delegation not found");

    // Only the delegation's own delegator (or a super-admin) may modify it.
    if (existing.delegatorId !== userId && !permissions.includes("*")) return forbidden();

    // If the end date is being changed to a real value, it must be strictly
    // after the delegation's start date. (Clearing it to null is allowed.)
    if (parsed.data.toDate) {
      const to = new Date(parsed.data.toDate);
      if (to <= existing.fromDate) return validationError("toDate must be after fromDate");
    }

    const updated = await prisma.delegation.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.isActive !== undefined && { isActive: parsed.data.isActive }),
        ...(parsed.data.toDate !== undefined && { toDate: parsed.data.toDate ? new Date(parsed.data.toDate) : null }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Update", entityType: "Delegation", entityId: params.id });
    return successResponse(updated);
  } catch (error) {
    console.error("PUT /delegations/[id] error:", error);
    return internalError();
  }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId, permissions }, params) => {
  try {
    const existing = await prisma.delegation.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Delegation not found");

    // Only the delegation's own delegator (or a super-admin) may delete it.
    if (existing.delegatorId !== userId && !permissions.includes("*")) return forbidden();

    await prisma.delegation.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: userId },
    });

    await createAuditLog({ orgId, userId, action: "Delete", entityType: "Delegation", entityId: params.id });
    return successResponse({ id: params.id, deleted: true });
  } catch (error) {
    console.error("DELETE /delegations/[id] error:", error);
    return internalError();
  }
});
