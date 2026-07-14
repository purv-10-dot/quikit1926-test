import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { getCallerEmployeeId } from "@/lib/rbac/scope";
import {
  getActiveChainLevels,
  getCallerRoleIds,
  callerCanActionLevel,
} from "@/lib/services/approval-chain";

/**
 * GET /api/v1/hrms/leaves/requests/pending-approvals
 *
 * Leave requests currently awaiting a decision the caller can make. Approvals
 * are multi-level and role-aware: a request is visible here to everyone who
 * holds the role of its *current* level (the lowest-numbered still-Pending
 * approval), plus the specific approver the chain routed it to at apply time.
 * This matches exactly what the approve route will authorize. Powers the
 * "Leave approvals" inbox + badge.
 *
 * Expired requests (leave dates already passed) are still returned with their
 * endDate so the caller can drop them client-side — matching the "Expired"
 * treatment on the my-leaves history page.
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const callerId = (await getCallerEmployeeId(ctx)) ?? ctx.userId;

    const [chainLevels, roleIds] = await Promise.all([
      getActiveChainLevels(orgId, "Leave"),
      getCallerRoleIds(orgId, callerId),
    ]);

    // All pending requests that still have at least one pending approval level.
    const requests = await prisma.leaveRequest.findMany({
      where: {
        orgId,
        deletedAt: null,
        status: "Pending",
        approvals: { some: { status: "Pending" } },
      },
      orderBy: { appliedOn: "desc" },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        duration: true,
        reason: true,
        appliedOn: true,
        approvals: { select: { level: true, status: true, approverId: true } },
        leaveType: { select: { id: true, name: true, code: true, color: true } },
        employee: {
          select: {
            id: true, firstName: true, lastName: true, employeeCode: true,
            profilePhoto: true, department: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Keep only those whose *current* level the caller can action.
    const visible = requests.filter((r) => {
      const pending = r.approvals
        .filter((a) => a.status === "Pending")
        .sort((a, b) => a.level - b.level);
      const current = pending[0];
      if (!current) return false;
      const levelCfg = chainLevels?.find((l) => l.level === current.level);
      return callerCanActionLevel(
        levelCfg,
        { employeeId: callerId, roleIds },
        current.approverId,
      );
    });

    // Strip the approvals detail from the response shape (kept only for filtering).
    const payload = visible.map(({ approvals: _approvals, ...rest }) => rest);

    return successResponse(payload);
  } catch (error) {
    console.error("GET /leaves/requests/pending-approvals error:", error);
    return internalError();
  }
});
