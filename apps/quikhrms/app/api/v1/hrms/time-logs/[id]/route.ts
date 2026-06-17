import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { updateTimeLogSchema } from "@/lib/validations/gap-fill";
import { hoursBetween } from "@/lib/services/gap-fill";

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json();
    const parsed = updateTimeLogSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const existing = await prisma.timeLog.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Log not found");

    const start = parsed.data.startTime ? new Date(parsed.data.startTime) : existing.startTime;
    const end = parsed.data.endTime !== undefined ? (parsed.data.endTime ? new Date(parsed.data.endTime) : null) : existing.endTime;
    const duration = parsed.data.duration ?? hoursBetween(start, end);

    const updated = await prisma.timeLog.update({
      where: { id: params.id },
      data: {
        ...(parsed.data.date && { date: new Date(parsed.data.date) }),
        startTime: start,
        endTime: end,
        duration,
        ...(parsed.data.projectId !== undefined && { projectId: parsed.data.projectId }),
        ...(parsed.data.taskId !== undefined && { taskId: parsed.data.taskId }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.isBillable !== undefined && { isBillable: parsed.data.isBillable }),
        updatedBy: userId,
      },
    });

    return successResponse(updated);
  } catch (error) {
    console.error("PUT /time-logs/[id] error:", error);
    return internalError();
  }
});

export const DELETE = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const existing = await prisma.timeLog.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
    if (!existing) return notFound("Log not found");

    await prisma.timeLog.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), updatedBy: userId },
    });
    return successResponse({ id: params.id, deleted: true });
  } catch (error) {
    console.error("DELETE /time-logs/[id] error:", error);
    return internalError();
  }
});
