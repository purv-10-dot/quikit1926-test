import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { openHeadcountForDept } from "@/lib/services/requisition-approval-service";

/**
 * GET — returns pending approvals where current user is next-in-line approver,
 * plus departmental open-headcount count for budget context.
 */
export const GET = withAuth(async (_req: NextRequest, { orgId, userId }) => {
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

    const items = await Promise.all(
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

    return successResponse(items);
  } catch (e) {
    console.error("GET requisitions/approvals-queue", e);
    return internalError();
  }
});
