import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";

/**
 * GET /api/v1/hrms/wfh/team
 * Pending WFH approvals where the current user is the next approver.
 */
export const GET = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId) return notFound("Employee record not found");

    const pendingApprovals = await prisma.wfhApproval.findMany({
      where: { orgId, approverId: employeeId, status: "Pending" },
      include: {
        request: {
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, jobTitle: true, department: { select: { name: true } } } },
            approvals: { orderBy: { level: "asc" } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Filter: only return requests where THIS approval is the NEXT pending one (not blocked by earlier level)
    const items = pendingApprovals
      .filter((a) => {
        if (a.request.status !== "Pending") return false;
        const earliestPending = a.request.approvals.find((x) => x.status === "Pending");
        return earliestPending?.id === a.id;
      })
      .map((a) => ({
        approvalId: a.id,
        level: a.level,
        role: a.role,
        request: a.request,
      }));

    return successResponse(items);
  } catch (e) {
    console.error("GET /wfh/team", e);
    return internalError();
  }
});
