import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, forbidden, conflict, internalError } from "@/lib/api-response";
import { buildPolicySnapshot, validateAgainstSnapshot, resolveExpenseLevelApproverIds, type ExpenseChainLevel } from "@/lib/services/expenses";
import { createAuditLog } from "@/lib/utils/audit";
import { fireWorkflow } from "@/lib/workflows/executor";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { getActiveChainLevels } from "@/lib/services/approval-chain";
import { notifyExpenseApprovers } from "@/lib/services/expense-notify";

export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const claim = await prisma.expenseClaim.findFirst({
      where: { id, orgId, deletedAt: null },
      include: { employee: { select: { reportingManagerId: true, department: { select: { headId: true } } } } },
    });
    if (!claim) return notFound("Claim not found");
    // Owner-only submission.
    const meId = await resolveEmployeeId(orgId, userId);
    if (!meId || claim.employeeId !== meId) return forbidden("You can only submit your own expense claim.");
    if (claim.status !== "Draft") return conflict("Only draft claims can be submitted");

    let policyViolations: string[] = [];
    let snapshot = null;
    if (claim.policyId) {
      snapshot = await buildPolicySnapshot(orgId, claim.policyId);
      if (!snapshot) return conflict("Linked policy no longer exists");
      const validation = await validateAgainstSnapshot(
        orgId, snapshot, claim.employeeId,
        Number(claim.totalAmount), claim.expenseDate ?? new Date(),
        claim.receiptUrl,
      );
      policyViolations = validation.violations;
      // ENFORCE the policy — a claim that breaches caps / receipt rules can't be
      // submitted (previously violations were recorded but submission proceeded).
      if (policyViolations.length > 0) {
        return conflict(`This claim can't be submitted — policy violations: ${policyViolations.join("; ")}`);
      }
    }

    const updated = await prisma.expenseClaim.update({
      where: { id },
      data: {
        status: "Submitted",
        submittedAt: new Date(),
        ...(snapshot && { policySnapshot: JSON.parse(JSON.stringify(snapshot)) }),
        updatedBy: userId,
      },
    });

    await createAuditLog({
      orgId, userId, action: "StatusChange", entityType: "ExpenseClaim", entityId: id,
      metadata: { to: "Submitted", violations: policyViolations },
    });

    void fireWorkflow({
      orgId,
      event: "expense.submitted",
      payload: {
        employeeId: updated.employeeId,
        claimId: updated.id,
        totalAmount: Number(updated.totalAmount),
        violations: policyViolations,
      },
    });

    // Notify whoever holds level 1 of the approval chain — same resolution
    // order the approve route enforces (per-policy chain → central chain →
    // reporting-manager/dept-head fallback).
    void (async () => {
      const chain: ExpenseChainLevel[] = (snapshot?.approvalChain as ExpenseChainLevel[] | undefined) ?? [];
      const centralLevels = chain.length === 0 ? await getActiveChainLevels(orgId, "Expense") : null;
      const approverIds = await resolveExpenseLevelApproverIds(
        orgId, 1, chain, centralLevels,
        { reportingManagerId: claim.employee?.reportingManagerId ?? null, departmentHeadId: claim.employee?.department?.headId ?? null },
        updated.employeeId,
      );
      await notifyExpenseApprovers(orgId, {
        id: updated.id,
        employeeId: updated.employeeId,
        title: updated.title,
        category: updated.category,
        totalAmount: Number(updated.totalAmount),
        currency: updated.currency,
      }, 1, approverIds);
    })();

    return successResponse({ claim: updated, violations: policyViolations });
  } catch (error) {
    console.error("POST /expenses/claims/[id]/submit error:", error);
    return internalError();
  }
});
