import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";

/**
 * GET /api/v1/hrms/offboarding/resignations?scope=pending
 *
 * Resignation approval queue. Returns self-service resignations the caller may
 * decide on:
 *  - the employee's reporting manager (resignationApproverId === caller), or
 *  - HR/admin (permissions include "*" or hrms.offboarding.write) → all.
 * `scope=pending` (default) limits to those still awaiting a decision.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, permissions } = ctx;
    const { searchParams } = new URL(req.url);
    const scope = searchParams.get("scope") ?? "pending";

    const isHr = permissions.includes("*") || permissions.includes("hrms.offboarding.write");
    const callerEmployeeId = await resolveEmployeeId(orgId, ctx.userId);

    // Non-HR who aren't anyone's approver see an empty queue.
    if (!isHr && !callerEmployeeId) return successResponse([]);

    const where = {
      orgId,
      deletedAt: null,
      // Only rows that went through the self-service resignation approval flow.
      resignationApprovalStatus: scope === "pending" ? "Pending" : { not: null },
      ...(isHr ? {} : { resignationApproverId: callerEmployeeId }),
    };

    const rows = await prisma.offboardingInstance.findMany({
      where,
      orderBy: { resignationDate: "desc" },
      select: {
        id: true, resignationDate: true, lastWorkingDate: true, reason: true,
        notes: true, resignationApprovalStatus: true, resignationApproverId: true,
        resignationDecisionAt: true, resignationRejectionReason: true, createdAt: true,
        employeeId: true,
      },
    });

    // OffboardingInstance has no Employee relation (employeeId is a plain
    // column), so hydrate employee details in a second query.
    const empIds = [...new Set(rows.map((r) => r.employeeId))];
    const emps = empIds.length
      ? await prisma.employee.findMany({
          where: { orgId, id: { in: empIds } },
          select: {
            id: true, firstName: true, lastName: true, employeeCode: true,
            jobTitle: true, profilePhoto: true, noticePeriodDays: true,
            department: { select: { name: true } },
          },
        })
      : [];
    const byId = new Map(emps.map((e) => [e.id, e]));

    const data = rows
      .map((r) => ({ ...r, employee: byId.get(r.employeeId) ?? null }))
      .filter((r) => r.employee);

    return successResponse(data);
  } catch (error) {
    console.error("GET /offboarding/resignations error:", error);
    return internalError();
  }
});
