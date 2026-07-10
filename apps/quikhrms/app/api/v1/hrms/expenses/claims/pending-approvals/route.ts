import { NextRequest } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { getCallerEmployeeId } from "@/lib/rbac/scope";
import { claimsAwaitingApprover } from "@/lib/services/expenses";

/**
 * GET /api/v1/hrms/expenses/claims/pending-approvals
 *
 * Expense claims currently awaiting a decision *from the caller* — i.e. the
 * caller satisfies the approverType at each claim's current chain level (see
 * claimsAwaitingApprover). Unlike `?status=Submitted` on the list route (which
 * returns every submitted claim in the caller's read scope), this only counts
 * items the caller can actually act on. Powers the "Expense approvals" badge.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const callerEmployeeId = await getCallerEmployeeId(ctx);
    const isSuper = ctx.permissions.includes("*");
    const claims = await claimsAwaitingApprover(orgId, {
      callerEmployeeId,
      roles: ctx.roles,
      isSuper,
    });
    return successResponse(claims);
  } catch (error) {
    console.error("GET /expenses/claims/pending-approvals error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.expense.approve"] });
