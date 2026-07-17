import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { openHeadcountForDept } from "@/lib/services/requisition-approval-service";
import { getActiveChainLevels, getCallerRoleIds, callerCanActionLevel } from "@/lib/services/approval-chain";

/**
 * GET — returns the caller's approval inbox plus (for admins) an org-wide view.
 *
 *  mine — pending approvals where the current user is the NEXT-in-line approver
 *         (actionable: approve/reject). Includes budget context.
 *  all  — every requisition currently PendingApproval in the org, read-only,
 *         annotated with who it is waiting on. Populated for admins only, so an
 *         admin who raised a requisition can still see it sitting in someone
 *         else's queue instead of a misleading "all caught up".
 */
export const GET = withAuth(async (_req: NextRequest, { orgId, userId, roles, permissions }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    // Inbox = every PendingApproval requisition whose CURRENT level the caller can
    // action — either they're the assigned representative approver, or they hold
    // the level's role (role levels are actionable by any holder of that role).
    const chainLevels = await getActiveChainLevels(orgId, "Requisition");
    const roleIds = await getCallerRoleIds(orgId, employeeId);

    const pendingReqs = await prisma.jobRequisition.findMany({
      where: { orgId, deletedAt: null, status: "PendingApproval" },
      include: {
        department: { select: { id: true, name: true } },
        raiser: { select: { id: true, firstName: true, lastName: true, workEmail: true, jobTitle: true } },
        approvals: { orderBy: { level: "asc" } },
      },
      orderBy: { raisedAt: "desc" },
    });

    const mine = (await Promise.all(
      pendingReqs.map(async (r) => {
        const current = r.approvals.find((x) => x.status === "Pending");
        if (!current) return null;
        const levelCfg = chainLevels?.find((l) => l.level === current.level);
        if (!callerCanActionLevel(levelCfg, { employeeId, roleIds }, current.approverId)) return null;
        return {
          approvalId: current.id,
          level: current.level,
          role: current.role,
          openDeptHeadcount: await openHeadcountForDept(orgId, r.departmentId),
          requisition: r,
        };
      }),
    )).filter((x): x is NonNullable<typeof x> => x !== null);

    // Org-wide visibility (admins only). Non-admins get [] — their inbox is `mine`.
    const isAdmin = permissions.includes("*") || roles.includes("admin");
    let all: OrgPendingItem[] = [];
    if (isAdmin) {
      const reqs = await prisma.jobRequisition.findMany({
        where: { orgId, deletedAt: null, status: "PendingApproval" },
        select: {
          id: true, requisitionNumber: true, title: true, priority: true, positions: true,
          raisedAt: true,
          department: { select: { id: true, name: true } },
          raiser: { select: { id: true, firstName: true, lastName: true } },
          approvals: {
            orderBy: { level: "asc" },
            select: {
              id: true, level: true, role: true, status: true, approverId: true,
              approver: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { raisedAt: "desc" },
      });
      all = reqs.map((r) => {
        const current = r.approvals.find((a) => a.status === "Pending") ?? null;
        const approvedCount = r.approvals.filter((a) => a.status === "Approved").length;
        return {
          requisitionId: r.id,
          requisitionNumber: r.requisitionNumber,
          title: r.title,
          priority: r.priority,
          positions: r.positions,
          department: r.department,
          raiser: r.raiser,
          currentLevel: current?.level ?? null,
          currentRole: (current?.role as "DeptHead" | "HR" | undefined) ?? null,
          currentApprover: current?.approver ?? null,
          waitingOnMe: current?.approverId === employeeId,
          approvedCount,
          totalLevels: r.approvals.length,
          raisedAt: r.raisedAt,
        };
      });
    }

    return successResponse({ mine, all });
  } catch (e) {
    console.error("GET requisitions/approvals-queue", e);
    return internalError();
  }
});

interface OrgPendingItem {
  requisitionId: string;
  requisitionNumber: string;
  title: string;
  priority: string;
  positions: number;
  department: { id: string; name: string } | null;
  raiser: { id: string; firstName: string; lastName: string } | null;
  currentLevel: number | null;
  currentRole: "DeptHead" | "HR" | null;
  currentApprover: { id: string; firstName: string; lastName: string } | null;
  waitingOnMe: boolean;
  approvedCount: number;
  totalLevels: number;
  raisedAt: Date | null;
}
