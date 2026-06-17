import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { updateExpenseClaimSchema } from "@/lib/validations/expenses";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const claim = await prisma.expenseClaim.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        approvals: { orderBy: { actionAt: "desc" } },
        policy: { select: { id: true, name: true, approvalLevels: true, approvalChain: true } },
      },
    });
    if (!claim) return notFound("Claim not found");
    return successResponse(claim);
  } catch (error) {
    console.error("GET /expenses/claims/[id] error:", error);
    return internalError();
  }
});

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const body = await req.json();
    const parsed = updateExpenseClaimSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const existing = await prisma.expenseClaim.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Claim not found");
    if (existing.status !== "Draft") return conflict("Only draft claims can be updated");

    const { expenseDate, ...rest } = parsed.data;

    const updated = await prisma.expenseClaim.update({
      where: { id },
      data: {
        ...rest,
        ...(expenseDate !== undefined && { expenseDate: expenseDate ? new Date(expenseDate) : null }),
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Update", entityType: "ExpenseClaim", entityId: id });
    return successResponse(updated);
  } catch (error) {
    console.error("PUT /expenses/claims/[id] error:", error);
    return internalError();
  }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const existing = await prisma.expenseClaim.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Claim not found");
    if (existing.status === "Paid") return conflict("Cannot delete paid claim");

    await prisma.expenseClaim.update({
      where: { id },
      data: { deletedAt: new Date(), status: "Cancelled", updatedBy: userId },
    });

    await createAuditLog({ orgId, userId, action: "Delete", entityType: "ExpenseClaim", entityId: id });
    return successResponse({ id, deleted: true });
  } catch (error) {
    console.error("DELETE /expenses/claims/[id] error:", error);
    return internalError();
  }
});
