import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { updateOffboardingTaskSchema } from "@/lib/validations/boarding";
import { createAuditLog } from "@/lib/utils/audit";
import { advanceAutomation, finalizeOffboardingIfComplete } from "@/lib/services/offboarding-automation";

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
      // Shared finalization (used by every completion path). If it didn't close
      // the offboarding, chain the automation to send the next step.
      const finalized = await finalizeOffboardingIfComplete(task.instanceId, orgId, userId);
      if (!finalized) await advanceAutomation(task.instanceId, orgId);
    }

    await createAuditLog({ orgId, userId, action: "Update", entityType: "OffboardingTask", entityId: taskId, changes: parsed.data });
    return successResponse(updated);
  } catch (error) {
    console.error("PUT /offboarding/tasks/[taskId] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });
