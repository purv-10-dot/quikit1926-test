import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { updateOnboardingTaskSchema } from "@/lib/validations/boarding";
import { createAuditLog } from "@/lib/utils/audit";

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { taskId } = params;
    const body = await req.json();
    const parsed = updateOnboardingTaskSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const task = await prisma.onboardingTask.findFirst({ where: { id: taskId, orgId } });
    if (!task) return notFound("Task not found");

    const { status, dueDate, assigneeId, notes } = parsed.data;

    const updated = await prisma.onboardingTask.update({
      where: { id: taskId },
      data: {
        ...(status && { status }),
        ...(assigneeId !== undefined && { assigneeId }),
        ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
        ...(notes !== undefined && { notes }),
        ...(status === "TaskCompleted" && { completedAt: new Date(), completedBy: userId }),
      },
    });

    if (status === "TaskCompleted") {
      const remaining = await prisma.onboardingTask.count({
        where: { instanceId: task.instanceId, status: { notIn: ["TaskCompleted", "TaskSkipped"] } },
      });
      if (remaining === 0) {
        const instance = await prisma.onboardingInstance.update({
          where: { id: task.instanceId },
          data: { status: "OnboardCompleted", completedAt: new Date(), updatedBy: userId },
        });
        await prisma.employee.update({
          where: { id: instance.employeeId },
          data: { status: "Active", inviteStatus: "Invited", updatedBy: userId },
        });
      }
    }

    await createAuditLog({ orgId, userId, action: "Update", entityType: "OnboardingTask", entityId: taskId, changes: parsed.data });
    return successResponse(updated);
  } catch (error) {
    console.error("PUT /onboarding/tasks/[taskId] error:", error);
    return internalError();
  }
});
