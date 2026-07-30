import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, forbidden, internalError } from "@/lib/api-response";
import { createPIPSchema } from "@/lib/validations/performance";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { fireWorkflow } from "@/lib/workflows/executor";
import { resolveScope, employeeScopeFilter, getCallerEmployeeId } from "@/lib/rbac/scope";
import { PERF_READ_MAP, isDirectManagerOf } from "@/lib/rbac/performance-access";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");

    // Only the PIP's employee, their manager, or HR may read. No org-wide
    // enumeration of who's on a PIP.
    const canManagePip = ctx.permissions.includes("*") || ctx.permissions.includes("hrms.performance.pip");
    const sf = await employeeScopeFilter(ctx, resolveScope(ctx, PERF_READ_MAP));
    if (!canManagePip && !sf.allow) return forbidden("No permission to view PIPs");
    const empIds = canManagePip ? undefined : sf.employeeIds;
    if (employeeId && empIds && !empIds.includes(employeeId)) {
      return forbidden("You don't have access to this employee's PIP");
    }

    const where = {
      orgId, deletedAt: null,
      ...(employeeId ? { employeeId } : empIds ? { employeeId: { in: empIds } } : {}),
      ...(status && { status: status as "PIPActive" | "PIPExtended" | "PIPCompletedSuccess" | "PIPFailed" | "PIPWithdrawn" }),
    };

    const [pips, total] = await Promise.all([
      prisma.pIP.findMany({
        where, orderBy: { startDate: "desc" }, skip: (page - 1) * limit, take: limit,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, department: { select: { name: true } } } },
          initiatedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.pIP.count({ where }),
    ]);
    return successResponse(pips, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /performance/pip error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, userId } = ctx;
    const body = await req.json();
    const parsed = createPIPSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const callerId = await getCallerEmployeeId(ctx);
    if (callerId && data.employeeId === callerId) {
      return forbidden("You can't place yourself on a PIP.");
    }
    const canManagePip = ctx.permissions.includes("*") || ctx.permissions.includes("hrms.performance.pip");
    const allowed = canManagePip || (await isDirectManagerOf(ctx, data.employeeId));
    if (!allowed) return forbidden("Only a manager or HR can place an employee on a PIP.");

    const target = await prisma.employee.findFirst({
      where: { id: data.employeeId, orgId, deletedAt: null }, select: { id: true },
    });
    if (!target) return validationError("Invalid employee");

    const pip = await prisma.pIP.create({
      data: {
        orgId, employeeId: data.employeeId, initiatedById: userId,
        reason: data.reason, startDate: new Date(data.startDate), endDate: new Date(data.endDate),
        objectives: data.objectives ? JSON.parse(JSON.stringify(data.objectives)) : undefined,
        supportProvided: data.supportProvided ? JSON.parse(JSON.stringify(data.supportProvided)) : undefined,
        createdBy: userId, updatedBy: userId,
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });

    void fireWorkflow({
      orgId, event: "performance.pip.initiated",
      payload: { employeeId: pip.employeeId, pipId: pip.id, startDate: pip.startDate, endDate: pip.endDate },
    });

    await prisma.hrmsNotification.create({
      data: {
        orgId,
        employeeId: pip.employeeId,
        type: "Warning",
        channel: "InApp",
        title: "You have been placed on a PIP",
        message: `Period: ${pip.startDate.toISOString().slice(0, 10)} → ${pip.endDate.toISOString().slice(0, 10)}. Reason: ${pip.reason.slice(0, 100)}`,
        link: "/performance/pip",
        entityType: "PIP",
        entityId: pip.id,
      },
    });

    return successResponse(pip, undefined, 201);
  } catch (error) { console.error("POST /performance/pip error:", error); return internalError(); }
});
