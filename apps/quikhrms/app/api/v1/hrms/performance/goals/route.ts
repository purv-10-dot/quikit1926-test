import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError } from "@/lib/api-response";
import { createGoalSchema, goalTypeToDb, goalTypeFromDb } from "@/lib/validations/performance";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { fireWorkflow } from "@/lib/workflows/executor";
import { resolveScope, employeeScopeFilter, getCallerEmployeeId } from "@/lib/rbac/scope";
import { canAccessEmployee } from "@/lib/rbac/hierarchy";
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
    // A supplied ?employeeId must fall inside the caller's scope — never trust
    // it to drop the scope clause (was a scope-bypass IDOR).
    if (employeeId && scopeFilter.employeeIds && !scopeFilter.employeeIds.includes(employeeId)) {
      return forbidden("You don't have access to this employee's goals");
    }

    const where: Prisma.HrmsGoalWhereInput = {
      orgId, deletedAt: null,
      ...(employeeId
        ? { employeeId }
        : scopeFilter.employeeIds
          ? { employeeId: { in: scopeFilter.employeeIds } }
          : {}),
      ...(status && { status: status as Prisma.HrmsGoalWhereInput["status"] }),
      ...(type && { type: goalTypeToDb(type) }),
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
    goals.forEach(goalTypeFromDb);
    return successResponse(goals, paginationMeta(page, limit, total));
  } catch (error) { console.error("GET /performance/goals error:", error); return internalError(); }
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId, userId } = ctx;
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

    // Setting a goal for someone else requires them to be within the caller's
    // team/hierarchy — not just any employee in the org.
    const callerId = await getCallerEmployeeId(ctx);
    if (targetEmployeeId !== callerId && !(await canAccessEmployee(ctx, targetEmployeeId))) {
      return forbidden("You can only set goals for yourself or your team.");
    }

    const goal = await prisma.hrmsGoal.create({
      data: {
        orgId, employeeId: targetEmployeeId,
        parentGoalId: data.parentGoalId,
        title: data.title, description: data.description,
        type: goalTypeToDb(data.type), category: data.category,
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

    return successResponse(goalTypeFromDb(goal), undefined, 201);
  } catch (error) { console.error("POST /performance/goals error:", error); return internalError(); }
}, { requiredPermissions: ["hrms.performance.write"] });
