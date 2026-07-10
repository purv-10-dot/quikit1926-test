import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { openHeadcountForDept } from "@/lib/services/requisition-approval-service";

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

    const pendings = await prisma.requisitionApproval.findMany({
      where: { orgId, approverId: employeeId, status: "Pending" },
      include: {
        requisition: {
          include: {
            department: { select: { id: true, name: true } },
            raiser: { select: { id: true, firstName: true, lastName: true, workEmail: true, jobTitle: true } },
            approvals: { orderBy: { level: "asc" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const mine = await Promise.all(
      pendings
        .filter((a) => a.requisition.status === "PendingApproval")
        .filter((a) => a.requisition.approvals.find((x) => x.status === "Pending")?.id === a.id)
        .map(async (a) => ({
          approvalId: a.id,
          level: a.level,
          role: a.role,
          openDeptHeadcount: await openHeadcountForDept(orgId, a.requisition.departmentId),
          requisition: a.requisition,
        })),
    );

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
