import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createGoalSchema } from "@/lib/validations/performance";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { fireWorkflow } from "@/lib/workflows/executor";
import { resolveScope, employeeScopeFilter } from "@/lib/rbac/scope";
import { forbidden } from "@/lib/api-response";
import type { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const { searchParams } = new URL(req.url);
    const { page, limit } = parsePagination(searchParams);
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");
    const type = searchParams.get("type");

    const scope = resolveScope(ctx, {
      all: "hrms.performance.read",
      team: "hrms.performance.read_team",
      self: "hrms.performance.read_self",
    });
    const scopeFilter = await employeeScopeFilter(ctx, scope);
    if (!scopeFilter.allow) return forbidden("No performance read permission");

    const where: Prisma.GoalWhereInput = {
      orgId, deletedAt: null,
      ...(employeeId && { employeeId }),
      ...(scopeFilter.employeeIds && !employeeId && { employeeId: { in: scopeFilter.employeeIds } }),
      ...(status && { status: status as Prisma.GoalWhereInput["status"] }),
      ...(type && { type: type as Prisma.GoalWhereInput["type"] }),
    };

    const [goals, total] = await Promise.all([
      prisma.hrmsGoal.findMany({
        where, orderBy: { dueDate: "asc" }, skip: (page - 1) * limit, take: limit,
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, profilePhoto: true } },
          keyResults: true,
          _count: { select: { checkIns: true, childGoals: true } },
        },
      }),
      prisma.hrmsGoal.count({ where }),
    ]);
    return successResponse(goals, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /performance/goals error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createGoalSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const data = parsed.data;
    const targetEmployeeId = data.employeeId ?? userId;
    const employeeExists = await prisma.employee.findFirst({
      where: { id: targetEmployeeId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!employeeExists) return validationError("Invalid employee");

    const goal = await prisma.hrmsGoal.create({
      data: {
        orgId, employeeId: targetEmployeeId,
        parentGoalId: data.parentGoalId,
        title: data.title, description: data.description,
        type: data.type, category: data.category,
        metric: data.metric, targetValue: data.targetValue, unit: data.unit, weight: data.weight,
        startDate: new Date(data.startDate), dueDate: new Date(data.dueDate),
        alignedTo: data.alignedTo, visibility: data.visibility,
        createdBy: userId, updatedBy: userId,
        keyResults: data.keyResults ? { create: data.keyResults.map((kr) => ({ ...kr })) } : undefined,
      },
      include: { keyResults: true },
    });

    void fireWorkflow({
      orgId, event: "performance.goal.created",
      payload: { employeeId: goal.employeeId, goalId: goal.id, title: goal.title, dueDate: goal.dueDate },
    });

    return successResponse(goal, undefined, 201);
  } catch (error) { console.error("POST /performance/goals error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.performance.write"] });
