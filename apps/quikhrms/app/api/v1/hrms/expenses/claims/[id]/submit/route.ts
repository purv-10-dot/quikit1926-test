import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, conflict, internalError } from "@/lib/api-response";
import { buildPolicySnapshot, validateAgainstSnapshot } from "@/lib/services/expenses";
import { createAuditLog } from "@/lib/utils/audit";
import { fireWorkflow } from "@/lib/workflows/executor";

export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const claim = await prisma.expenseClaim.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!claim) return notFound("Claim not found");
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

    return successResponse({ claim: updated, violations: policyViolations });
  } catch (error) {
    console.error("POST /expenses/claims/[id]/submit error:", error);
    return internalError();
  }
});
