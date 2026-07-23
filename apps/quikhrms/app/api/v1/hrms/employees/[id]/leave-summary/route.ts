import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withServiceAuth } from "@/lib/with-auth";
import { successResponse, forbidden, internalError } from "@/lib/api-response";
import { canAccessEmployee } from "@/lib/rbac/hierarchy";
import { resolveEmployeeId } from "@/lib/resolve-employee";

/**
 * GET /api/v1/hrms/employees/:id/leave-summary?year=YYYY — compact leave-balance
 * summary for AI prompt-context (P0-3, the self-service Copilot hot path).
 *
 * Returns one compact row per leave type: available days + the type label.
 * No sensitive data — leave balances are §13-safe. Uses the same balance
 * formula as GET /leaves/balances (opening = LeaveType.maxBalance).
 *
 * Guard mirrors /leaves/balances: self is always allowed; viewing another
 * employee requires clearing the role-hierarchy access check.
 *
 * `:id` accepts "me" → resolves to the caller's own Employee.id.
 */
export const GET = withServiceAuth(async (req: NextRequest, ctx, params) => {
  try {
    const { orgId, userId } = ctx;
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);

    const meId = await resolveEmployeeId(orgId, userId);
    const employeeId = params.id === "me" || params.id === userId ? meId : params.id;
    if (!employeeId) return forbidden("Could not resolve employee");

    if (employeeId !== meId) {
      const allowed = await canAccessEmployee(ctx, employeeId);
      if (!allowed) return forbidden("Cannot view balances of an employee above your role hierarchy");
    }

    const balances = await prisma.leaveBalance.findMany({
      where: { orgId, year, employeeId, deletedAt: null },
      include: {
        leaveType: { select: { name: true, code: true, maxBalance: true, isPaid: true } },
      },
      orderBy: { leaveType: { name: "asc" } },
    });

    const summary = balances.map((b) => {
      const opening = Number(b.leaveType.maxBalance);
      const available =
        opening + Number(b.accrued) + Number(b.adjusted) + Number(b.carriedForward) -
        Number(b.taken) - Number(b.encashed) - Number(b.lapsed);
      return {
        leaveType: b.leaveType.name,
        code: b.leaveType.code,
        isPaid: b.leaveType.isPaid,
        available,
      };
    });

    const base = process.env.NEXT_PUBLIC_QUIKHRMS_URL ?? process.env.APP_URL ?? "";
    return successResponse({
      employeeId,
      year,
      balances: summary,
      url: `${base}/leaves`,
    });
  } catch (error) {
    console.error("GET /employees/:id/leave-summary error:", error);
    return internalError();
  }
});
