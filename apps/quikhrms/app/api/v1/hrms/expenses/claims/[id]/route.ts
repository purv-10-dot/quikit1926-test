import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, forbidden, conflict, internalError } from "@/lib/api-response";
import { updateExpenseClaimSchema } from "@/lib/validations/expenses";
import { createAuditLog } from "@/lib/utils/audit";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { urlBelongsToTenant } from "@/lib/storage";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const claim = await prisma.expenseClaim.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        approvals: { orderBy: { actionAt: "desc" } },
        policy: { select: { id: true, name: true, approvalLevels: true, approvalChain: true } },
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
    });
    if (!claim) return notFound("Claim not found");

    // ExpenseApproval.approverId has no Employee relation — resolve names by id.
    const approverIds = [...new Set(claim.approvals.map((a) => a.approverId))];
    const approvers = approverIds.length
      ? await prisma.employee.findMany({
          where: { orgId, id: { in: approverIds } },
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        })
      : [];
    const approverMap = new Map(approvers.map((e) => [e.id, e]));

    const payload = {
      ...claim,
      approvals: claim.approvals.map((a) => ({ ...a, approver: approverMap.get(a.approverId) ?? null })),
    };

    return successResponse(payload);
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
    // Owner-only: you can only edit your own claim.
    const meId = await resolveEmployeeId(orgId, userId);
    if (!meId || existing.employeeId !== meId) return forbidden("You can only edit your own expense claim.");
    if (existing.status !== "Draft") return conflict("Only draft claims can be updated");

    // Re-run the same policy checks POST does whenever a money-relevant field
    // changes — otherwise you could create a tiny compliant Draft, PUT it huge,
    // then submit (edits previously skipped all policy validation).
    const touchesPolicy =
      parsed.data.policyId !== undefined ||
      parsed.data.category !== undefined ||
      parsed.data.totalAmount !== undefined ||
      parsed.data.receiptUrl !== undefined;
    if (touchesPolicy) {
      const effPolicyId = parsed.data.policyId ?? existing.policyId;
      const effCategory = parsed.data.category ?? existing.category;
      const effAmount = Number(parsed.data.totalAmount ?? existing.totalAmount);
      const effReceipt = parsed.data.receiptUrl !== undefined ? parsed.data.receiptUrl : existing.receiptUrl;

      const policy = await prisma.expensePolicy.findFirst({
        where: { id: effPolicyId, orgId, deletedAt: null, isActive: true },
      });
      if (!policy) return validationError("Selected policy is invalid or inactive");
      if (policy.category !== effCategory) {
        return validationError(`Category "${effCategory}" does not match policy category "${policy.category}"`);
      }
      if (policy.maxPerTransaction != null && effAmount > Number(policy.maxPerTransaction)) {
        return validationError(`Amount exceeds policy limit of ${policy.maxPerTransaction} per transaction`);
      }
      if (policy.requiresReceipt && effAmount > Number(policy.receiptThreshold) && !effReceipt) {
        return validationError(`Receipt required for amounts above ${policy.receiptThreshold}`);
      }
      if (effReceipt && !urlBelongsToTenant(effReceipt, orgId)) {
        return validationError("Receipt must be an uploaded file, not an external link.");
      }
    }

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
    // Owner-only: you can only cancel/delete your own claim.
    const meId = await resolveEmployeeId(orgId, userId);
    if (!meId || existing.employeeId !== meId) return forbidden("You can only cancel your own expense claim.");
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
