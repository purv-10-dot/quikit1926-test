import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { updateExpensePolicySchema } from "@/lib/validations/expenses";
import { createAuditLog } from "@/lib/utils/audit";

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const body = await req.json();
    const parsed = updateExpensePolicySchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const existing = await prisma.expensePolicy.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Policy not found");

    const { approvalChain, applicableTo, ...rest } = parsed.data;

    const policy = await prisma.expensePolicy.update({
      where: { id },
      data: {
        ...rest,
        ...(approvalChain !== undefined && { approvalChain: approvalChain ? JSON.parse(JSON.stringify(approvalChain)) : undefined }),
        ...(applicableTo !== undefined && { applicableTo: applicableTo ? JSON.parse(JSON.stringify(applicableTo)) : undefined }),
        updatedBy: userId,
      },
    });

    await createAuditLog({ orgId, userId, action: "Update", entityType: "ExpensePolicy", entityId: id });
    return successResponse(policy);
  } catch (error) {
    console.error("PUT /expenses/policies/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.expense.manage"] });

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const existing = await prisma.expensePolicy.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound("Policy not found");

    await prisma.expensePolicy.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, updatedBy: userId },
    });

    await createAuditLog({ orgId, userId, action: "Delete", entityType: "ExpensePolicy", entityId: id });
    return successResponse({ id, deleted: true });
  } catch (error) {
    console.error("DELETE /expenses/policies/[id] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.expense.manage"] });
