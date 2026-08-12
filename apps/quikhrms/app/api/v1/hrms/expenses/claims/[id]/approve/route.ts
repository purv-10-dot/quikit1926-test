import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, forbidden, internalError } from "@/lib/api-response";
import { approveClaimSchema } from "@/lib/validations/expenses";
import {
  nextStatusAfterApproval,
  isEligibleExpenseApprover,
  resolveExpenseLevelApproverIds,
  EXPENSE_APPROVER_LABEL,
  type ExpenseChainLevel,
} from "@/lib/services/expenses";
import { getCallerEmployeeId } from "@/lib/rbac/scope";
import { createAuditLog } from "@/lib/utils/audit";
import { fireWorkflow } from "@/lib/workflows/executor";
import { getActiveChainLevels, callerCanActionLevel, getCallerRoleIds } from "@/lib/services/approval-chain";
import { notifyExpenseApprovers, notifyExpenseDecision } from "@/lib/services/expense-notify";

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

    // Segregation of duties: no one — including super-admin — can approve or
    // reject their OWN claim (matches the leave route).
    const callerEmpId = await getCallerEmployeeId(ctx);
    if (callerEmpId && claim.employeeId === callerEmpId) {
      return forbidden("You can't approve or reject your own expense claim.");
    }

    if (!["Submitted", "ManagerApproved", "FinanceApproved"].includes(claim.status)) {
      return conflict(`Cannot approve claim in ${claim.status} state`);
    }

    const approvalsSoFar = await prisma.expenseApproval.count({ where: { orgId, claimId: id } });
    const currentLevel = approvalsSoFar + 1;
    // Prefer frozen snapshot value; fall back to live policy or 1.
    const snap = claim.policySnapshot as { approvalLevels?: number; approvalChain?: ExpenseChainLevel[] } | null;

    // ── Enforce the approval chain by role ──────────────────────────────
    // Use the frozen snapshot chain if present, else the live policy chain.
    // No per-policy chain → try the central Approval Chain (Settings → Approval
    // Chains → "Expense"). No chain anywhere → reporting-manager / dept-head
    // fallback. super_admin (permissions "*") bypasses so it can never be locked out.
    const chain: ExpenseChainLevel[] =
      (snap?.approvalChain as ExpenseChainLevel[] | undefined) ??
      ((claim.policy?.approvalChain as ExpenseChainLevel[] | null) ?? []);
    // Central chain is consulted ONLY when the policy defines no chain of its own,
    // so existing per-policy setups are never overridden.
    const centralLevels = chain.length === 0 ? await getActiveChainLevels(orgId, "Expense") : null;

    const totalLevels =
      centralLevels && centralLevels.length > 0
        ? centralLevels.length
        : (snap?.approvalLevels ?? claim.policy?.approvalLevels ?? 1);

    const isSuper = ctx.permissions.includes("*");
    const claimApprovers = {
      reportingManagerId: claim.employee?.reportingManagerId ?? null,
      departmentHeadId: claim.employee?.department?.headId ?? null,
    };
    // Approver-eligibility gate runs for EVERY action — including "Escalated",
    // which must not be a way to bypass the chain. super_admin ("*") excepted.
    if (!isSuper) {
      if (chain.length > 0) {
        const levelCfg = chain.find((c) => c.level === currentLevel);
        // A configured chain with no rule for this level is a misconfiguration —
        // fail closed rather than silently allowing anyone through.
        if (!levelCfg) {
          return forbidden("No approver configured for this level.");
        }
        const eligible = isEligibleExpenseApprover(levelCfg, ctx.roles, callerEmpId, claimApprovers);
        if (!eligible) {
          return forbidden(`Level ${currentLevel} must be actioned by ${EXPENSE_APPROVER_LABEL[levelCfg.approverType]}.`);
        }
      } else if (centralLevels && centralLevels.length > 0) {
        // Central Approval Chain (ROLE / USER levels).
        const levelCfg = centralLevels.find((c) => c.level === currentLevel);
        if (!levelCfg) {
          return forbidden("No approver configured for this level.");
        }
        const roleIds = callerEmpId ? await getCallerRoleIds(orgId, callerEmpId) : [];
        const canAction = !!callerEmpId && callerCanActionLevel(levelCfg, { employeeId: callerEmpId, roleIds });
        if (!canAction) {
          return forbidden(`You are not the configured approver for level ${currentLevel} of the Expense approval chain.`);
        }
      } else {
        // No approval chain configured → require a genuine approver relationship,
        // never "any approver". Must be the employee's reporting manager or
        // department head.
        const eligible =
          (!!callerEmpId && callerEmpId === claimApprovers.reportingManagerId) ||
          (!!callerEmpId && callerEmpId === claimApprovers.departmentHeadId);
        if (!eligible) {
          return forbidden("Only the employee's reporting manager or department head can approve this claim.");
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

    const claimBrief = {
      id, employeeId: claim.employeeId, title: claim.title, category: claim.category,
      totalAmount: Number(claim.totalAmount), currency: claim.currency,
    };

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
      void notifyExpenseDecision(orgId, claimBrief, nextStatus as "Approved" | "Rejected", userId, parsed.data.comments);
    } else if (parsed.data.action === "ExpApproved") {
      // Advanced to the next level (ManagerApproved/FinanceApproved, not yet
      // terminal) — alert whoever holds that level so it doesn't sit unseen.
      void (async () => {
        const nextLevel = currentLevel + 1;
        const approverIds = await resolveExpenseLevelApproverIds(
          orgId, nextLevel, chain, centralLevels, claimApprovers, claim.employeeId,
        );
        await notifyExpenseApprovers(orgId, claimBrief, nextLevel, approverIds);
      })();
    }

    return successResponse({ approval, claimStatus: nextStatus }, undefined, 201);
  } catch (error) {
    console.error("POST /expenses/claims/[id]/approve error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.expense.approve"] });
