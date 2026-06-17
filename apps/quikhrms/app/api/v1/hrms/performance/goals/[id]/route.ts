import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, validationError, internalError } from "@/lib/api-response";
import { updateGoalSchema } from "@/lib/validations/performance";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const goal = await prisma.hrmsGoal.findFirst({
      where: { id: params.id, orgId, deletedAt: null },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        keyResults: true,
        checkIns: { orderBy: { date: "desc" }, take: 10, include: { updatedBy: { select: { firstName: true, lastName: true } } } },
        childGoals: { where: { deletedAt: null }, select: { id: true, title: true, status: true, progress: true } },
        parentGoal: { select: { id: true, title: true } },
      },
    });
    if (!goal) return notFound("Goal not found");
    return successResponse(goal);
  } catch (error) { console.error("GET /performance/goals/:id error:", error); return internalError(); }
});

export const PATCH = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.hrmsGoal.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Goal not found");

    const body = await req.json();
    const parsed = updateGoalSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const goal = await prisma.hrmsGoal.update({
      where: { id: params.id },
      data: { ...parsed.data, updatedBy: userId },
      include: { keyResults: true },
    });
    return successResponse(goal);
  } catch (error) { console.error("PATCH /performance/goals/:id error:", error); return internalError(); }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.hrmsGoal.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Goal not found");
    await prisma.hrmsGoal.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
    return successResponse({ deleted: true });
  } catch (error) { console.error("DELETE /performance/goals/:id error:", error); return internalError(); }
});
