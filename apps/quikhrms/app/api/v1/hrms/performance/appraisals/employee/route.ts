import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, forbidden, internalError } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { resolveScope, employeeScopeFilter, getCallerEmployeeId, getCallerReporteeIds } from "@/lib/rbac/scope";
import { PERF_READ_MAP, stripUnpublishedAppraisal } from "@/lib/rbac/performance-access";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const employeeId = searchParams.get("employeeId");
    const cycleId = searchParams.get("cycleId");
    const status = searchParams.get("status");

    // Confidentiality: reviewee sees only their own, a manager only their
    // reports, HR (read-all) everyone. Previously fully open.
    const scope = resolveScope(ctx, PERF_READ_MAP);
    const sf = await employeeScopeFilter(ctx, scope);
    if (!sf.allow) return forbidden("No performance read permission");
    if (employeeId && sf.employeeIds && !sf.employeeIds.includes(employeeId)) {
      return forbidden("You don't have access to this employee's appraisals");
    }

    const where = {
      orgId, deletedAt: null,
      ...(employeeId ? { employeeId } : sf.employeeIds ? { employeeId: { in: sf.employeeIds } } : {}),
      ...(cycleId && { cycleId }),
      ...(status && { status: status as "Pending" | "InProgress" | "Submitted" | "Completed" }),
    };

    const [appraisals, total] = await Promise.all([
      prisma.employeeAppraisal.findMany({
        where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, department: { select: { name: true } }, designation: { select: { title: true } } } },
          cycle: { select: { id: true, name: true, type: true, status: true } },
        },
      }),
      prisma.employeeAppraisal.count({ where }),
    ]);

    // Hide manager/final fields on the caller's OWN not-yet-published rows.
    const callerId = await getCallerEmployeeId(ctx);
    const isHR = ctx.permissions.includes("*") || ctx.permissions.includes("hrms.performance.appraise");
    const reporteeIds = isHR ? [] : await getCallerReporteeIds(ctx);
    const rows = appraisals.map((a) => {
      const canSeePrivileged = isHR || reporteeIds.includes(a.employeeId) || a.status === "Completed";
      return stripUnpublishedAppraisal(a as unknown as Record<string, unknown>, canSeePrivileged);
    });

    return successResponse(rows, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /appraisals/employee error:", error); return internalError(); }
});
