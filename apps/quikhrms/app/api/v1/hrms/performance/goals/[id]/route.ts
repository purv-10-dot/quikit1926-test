import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, forbidden, validationError, internalError } from "@/lib/api-response";
import { updateGoalSchema, goalTypeFromDb } from "@/lib/validations/performance";
import { resolveScope, employeeScopeFilter, getCallerEmployeeId } from "@/lib/rbac/scope";
import { PERF_READ_MAP, isDirectManagerOf } from "@/lib/rbac/performance-access";

/** Read access: the goal owner, or a caller whose read-scope covers the owner. */
async function assertReadable(ctx: Parameters<typeof employeeScopeFilter>[0], ownerId: string) {
  const callerId = await getCallerEmployeeId(ctx);
  const isOwner = ownerId === callerId;
  const sf = await employeeScopeFilter(ctx, resolveScope(ctx, PERF_READ_MAP));
  const inReadScope = sf.allow && (sf.employeeIds === undefined || sf.employeeIds.includes(ownerId));
  return { isOwner, inReadScope, ok: isOwner || inReadScope };
}

export const GET = withAuth(async (_req: NextRequest, ctx, params) => {
  try {
    const { orgId } = ctx;
    const goal = await prisma.hrmsGoal.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        keyResults: true,
        checkIns: { orderBy: { date: "desc" }, take: 10, include: { updatedBy: { select: { firstName: true, lastName: true } } } },
        childGoals: { where: { deletedAt: null }, select: { id: true, title: true, status: true, progress: true } },
        parentGoal: { select: { id: true, title: true, orgId: true } },
      },
    });
    if (!goal) return notFound("Goal not found");
    const { ok } = await assertReadable(ctx, goal.employeeId);
    if (!ok) return forbidden("You don't have access to this goal");
    // Only surface the parent goal when it belongs to the caller's org — never
    // leak a cross-tenant parent (and don't expose its orgId).
    const out = goalTypeFromDb(goal) as Record<string, unknown> & { parentGoal?: { id: string; title: string; orgId: string } | null };
    out.parentGoal = out.parentGoal && out.parentGoal.orgId === orgId
      ? { id: out.parentGoal.id, title: out.parentGoal.title, orgId: out.parentGoal.orgId }
      : null;
    if (out.parentGoal) delete (out.parentGoal as { orgId?: string }).orgId;
    return successResponse(out);
  } catch (error) { console.error("GET /performance/goals/:id error:", error); return internalError(); }
});

export const PATCH = withAuth(async (req: NextRequest, ctx, params) => {
  try {
    const { orgId, userId } = ctx;
    const existing = await prisma.hrmsGoal.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Goal not found");

    const { isOwner, inReadScope } = await assertReadable(ctx, existing.employeeId);
    const isManager = !isOwner && (await isDirectManagerOf(ctx, existing.employeeId));
    const canWrite =
      ctx.permissions.includes("*") ||
      isOwner || isManager ||
      (ctx.permissions.includes("hrms.performance.write") && inReadScope);
    if (!canWrite) return forbidden("You can't edit this goal.");

    const body = await req.json();
    const parsed = updateGoalSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const goal = await prisma.hrmsGoal.update({
      where: { id: params.id },
      data: { ...parsed.data, updatedBy: userId },
      include: { keyResults: true },
    });
    return successResponse(goalTypeFromDb(goal));
  } catch (error) { console.error("PATCH /performance/goals/:id error:", error); return internalError(); }
});

export const DELETE = withAuth(async (_req: NextRequest, ctx, params) => {
  try {
    const { orgId, userId } = ctx;
    const existing = await prisma.hrmsGoal.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Goal not found");

    const { isOwner, inReadScope } = await assertReadable(ctx, existing.employeeId);
    const isManager = !isOwner && (await isDirectManagerOf(ctx, existing.employeeId));
    const canWrite =
      ctx.permissions.includes("*") ||
      isOwner || isManager ||
      (ctx.permissions.includes("hrms.performance.write") && inReadScope);
    if (!canWrite) return forbidden("You can't delete this goal.");

    await prisma.hrmsGoal.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
    return successResponse({ deleted: true });
  } catch (error) { console.error("DELETE /performance/goals/:id error:", error); return internalError(); }
});
