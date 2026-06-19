import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { updateOffboardingTaskSchema } from "@/lib/validations/boarding";
import { createAuditLog } from "@/lib/utils/audit";

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { taskId } = params;
    const body = await req.json();
    const parsed = updateOffboardingTaskSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const task = await prisma.offboardingTask.findFirst({ where: { id: taskId, orgId } });
    if (!task) return notFound("Task not found");

    const { status, assigneeId, notes } = parsed.data;

    const updated = await prisma.offboardingTask.update({
      where: { id: taskId },
      data: {
        ...(status && { status }),
        ...(assigneeId !== undefined && { assigneeId }),
        ...(notes !== undefined && { notes }),
        ...(status === "TaskCompleted" && { completedAt: new Date(), completedBy: userId }),
      },
    });

    if (status === "TaskCompleted") {
      const remaining = await prisma.offboardingTask.count({
        where: { instanceId: task.instanceId, status: { notIn: ["TaskCompleted", "TaskSkipped"] } },
      });
      if (remaining === 0) {
        await prisma.offboardingInstance.update({
          where: { id: task.instanceId },
          data: { status: "OffboardCompleted", updatedBy: userId },
        });
      }
    }

    await createAuditLog({ orgId, userId, action: "Update", entityType: "OffboardingTask", entityId: taskId, changes: parsed.data });
    return successResponse(updated);
  } catch (error) {
    console.error("PUT /offboarding/tasks/[taskId] error:", error);
    return internalError();
  }
});
