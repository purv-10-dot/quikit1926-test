import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, forbidden, internalError } from "@/lib/api-response";
import { approveClaimSchema } from "@/lib/validations/expenses";
import {
  nextStatusAfterApproval,
  isEligibleExpenseApprover,
  EXPENSE_APPROVER_LABEL,
  type ExpenseChainLevel,
} from "@/lib/services/expenses";
import { getCallerEmployeeId } from "@/lib/rbac/scope";
import { createAuditLog } from "@/lib/utils/audit";
import { fireWorkflow } from "@/lib/workflows/executor";

export const POST = withAuth(async (req: NextRequest, ctx, params) => {
  try {
    const { orgId, userId } = ctx;
    const { id } = params;
    const body = await req.json();
    const parsed = approveClaimSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const claim = await prisma.expenseClaim.findFirst({
      where: { id, orgId, deletedAt: null },
      include: {
        policy: { select: { approvalLevels: true, approvalChain: true } },
        employee: {
          select: {
            reportingManagerId: true,
            department: { select: { headId: true } },
          },
        },
      },
    });
    if (!claim) return notFound("Claim not found");

    if (!["Submitted", "ManagerApproved", "FinanceApproved"].includes(claim.status)) {
      return conflict(`Cannot approve claim in ${claim.status} state`);
    }

    const approvalsSoFar = await prisma.expenseApproval.count({ where: { orgId, claimId: id } });
    const currentLevel = approvalsSoFar + 1;
    // Prefer frozen snapshot value; fall back to live policy or 1.
    const snap = claim.policySnapshot as { approvalLevels?: number; approvalChain?: ExpenseChainLevel[] } | null;
    const totalLevels = snap?.approvalLevels ?? claim.policy?.approvalLevels ?? 1;

    // ── Enforce the approval chain by role ──────────────────────────────
    // Use the frozen snapshot chain if present, else the live policy chain.
    // No chain defined → fall back to "any approver" (legacy behaviour).
    // super_admin (permissions "*") bypasses so it can never be locked out.
    const chain: ExpenseChainLevel[] =
      (snap?.approvalChain as ExpenseChainLevel[] | undefined) ??
      ((claim.policy?.approvalChain as ExpenseChainLevel[] | null) ?? []);
    const isSuper = ctx.permissions.includes("*");
    if (!isSuper && chain.length > 0 && (parsed.data.action === "ExpApproved" || parsed.data.action === "ExpRejected")) {
      const levelCfg = chain.find((c) => c.level === currentLevel);
      if (levelCfg) {
        const callerEmployeeId = await getCallerEmployeeId(ctx);
        const eligible = isEligibleExpenseApprover(levelCfg, ctx.roles, callerEmployeeId, {
          reportingManagerId: claim.employee?.reportingManagerId ?? null,
          departmentHeadId: claim.employee?.department?.headId ?? null,
        });
        if (!eligible) {
          return forbidden(`Level ${currentLevel} must be actioned by ${EXPENSE_APPROVER_LABEL[levelCfg.approverType]}.`);
        }
      }
    }

    const nextStatus = nextStatusAfterApproval(claim.status, parsed.data.action, currentLevel, totalLevels);

    const [approval] = await prisma.$transaction([
      prisma.expenseApproval.create({
        data: {
          orgId,
          claimId: id,
          approverId: userId,
          level: currentLevel,
          action: parsed.data.action,
          comments: parsed.data.comments,
        },
      }),
      prisma.expenseClaim.update({
        where: { id },
        data: {
          status: nextStatus as "Approved",
          ...(parsed.data.action === "ExpRejected" && { rejectionReason: parsed.data.comments }),
          ...(nextStatus === "Approved" && { approvedBy: userId, approvedAt: new Date() }),
          updatedBy: userId,
        },
      }),
    ]);

    await createAuditLog({
      orgId, userId,
      action: parsed.data.action === "ExpApproved" ? "Approve" : parsed.data.action === "ExpRejected" ? "Reject" : "StatusChange",
      entityType: "ExpenseClaim", entityId: id,
      metadata: { level: currentLevel, nextStatus },
    });

    if (nextStatus === "Approved" || nextStatus === "Rejected") {
      void fireWorkflow({
        orgId,
        event: nextStatus === "Approved" ? "expense.approved" : "expense.rejected",
        payload: {
          employeeId: claim.employeeId,
          claimId: id,
          level: currentLevel,
          totalAmount: Number(claim.totalAmount),
        },
      });
    }

    return successResponse({ approval, claimStatus: nextStatus }, undefined, 201);
  } catch (error) {
    console.error("POST /expenses/claims/[id]/approve error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.expense.approve"] });
