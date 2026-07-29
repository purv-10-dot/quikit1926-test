import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, forbidden, validationError, internalError } from "@/lib/api-response";
import { goalCheckInSchema } from "@/lib/validations/performance";
import { resolveScope, employeeScopeFilter, getCallerEmployeeId } from "@/lib/rbac/scope";
import { PERF_READ_MAP, isDirectManagerOf } from "@/lib/rbac/performance-access";

export const POST = withAuth(async (req: NextRequest, ctx, params) => {
  try {
    const { orgId, userId } = ctx;
    const goal = await prisma.hrmsGoal.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!goal) return notFound("Goal not found");

    // A check-in moves goal progress/status (which feeds the appraisal), so only
    // the owner, their manager, or a scoped performance writer may do it.
    const callerId = await getCallerEmployeeId(ctx);
    const isOwner = goal.employeeId === callerId;
    const sf = await employeeScopeFilter(ctx, resolveScope(ctx, PERF_READ_MAP));
    const inReadScope = sf.allow && (sf.employeeIds === undefined || sf.employeeIds.includes(goal.employeeId));
    const isManager = !isOwner && (await isDirectManagerOf(ctx, goal.employeeId));
    const canWrite =
      ctx.permissions.includes("*") ||
      isOwner || isManager ||
      (ctx.permissions.includes("hrms.performance.write") && inReadScope);
    if (!canWrite) return forbidden("You can't check in on this goal.");

    const body = await req.json();
    const parsed = goalCheckInSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const previousValue = Number(goal.currentValue);
    const { currentValue, note } = parsed.data;

    const progress = goal.targetValue && Number(goal.targetValue) > 0
      ? Math.min(100, Math.round((currentValue / Number(goal.targetValue)) * 10000) / 100)
      : 0;

    const [checkIn] = await Promise.all([
      prisma.goalCheckIn.create({
        data: { goalId: params.id, previousValue, currentValue, note, updatedById: userId },
      }),
      prisma.hrmsGoal.update({
        where: { id: params.id },
        data: {
          currentValue,
          progress,
          status: progress >= 100 ? "Completed" : progress > 0 ? "InProgress" : "NotStarted",
          updatedBy: userId,
        },
      }),
    ]);

    return successResponse(checkIn, undefined, 201);
  } catch (error) { console.error("POST /goals/:id/check-in error:", error); return internalError(); }
});
