import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { updateOffboardingTaskSchema } from "@/lib/validations/boarding";
import { createAuditLog } from "@/lib/utils/audit";
import { advanceAutomation } from "@/lib/services/offboarding-automation";

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

    // Freeze tasks once the offboarding is closed — no post-completion edits.
    const inst = await prisma.offboardingInstance.findFirst({
      where: { id: task.instanceId, orgId },
      select: { status: true },
    });
    if (inst && inst.status === "OffboardCompleted") {
      return conflict("This offboarding is already closed — its tasks can no longer be changed.");
    }

    const { status, assigneeId, notes, dueDate } = parsed.data;

    const updated = await prisma.offboardingTask.update({
      where: { id: taskId },
      data: {
        ...(status && { status }),
        ...(assigneeId !== undefined && { assigneeId }),
        ...(notes !== undefined && { notes }),
        ...(status === "TaskCompleted" && { completedAt: new Date(), completedBy: userId }),
      },
    });

    // dueDate is a new column not in the generated client — write it via raw SQL.
    if (dueDate !== undefined) {
      await prisma.$executeRaw`
        UPDATE "app_quikhrms"."OffboardingTask" SET "dueDate" = ${dueDate ? new Date(dueDate) : null} WHERE id = ${taskId}`;
    }

    if (status === "TaskCompleted" || status === "TaskSkipped") {
      const remaining = await prisma.offboardingTask.count({
        where: { instanceId: task.instanceId, status: { notIn: ["TaskCompleted", "TaskSkipped"] } },
      });
      if (remaining === 0) {
        const inst = await prisma.offboardingInstance.update({
          where: { id: task.instanceId },
          data: { status: "OffboardCompleted", updatedBy: userId },
        });
        // Final closure — mark the employee Relieved (exited / inactive).
        await prisma.employee.update({
          where: { id: inst.employeeId },
          data: { status: "Relieved", updatedBy: userId },
        }).catch(() => null);
      } else {
        await advanceAutomation(task.instanceId, orgId); // chain: send the next step
      }
    }

    await createAuditLog({ orgId, userId, action: "Update", entityType: "OffboardingTask", entityId: taskId, changes: parsed.data });
    return successResponse(updated);
  } catch (error) {
    console.error("PUT /offboarding/tasks/[taskId] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });
