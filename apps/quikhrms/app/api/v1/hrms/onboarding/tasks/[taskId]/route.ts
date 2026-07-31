import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { updateOnboardingTaskSchema } from "@/lib/validations/boarding";
import { createAuditLog } from "@/lib/utils/audit";
import { advanceAutomation } from "@/lib/services/onboarding-automation";

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

    // Illegal-transition guard: once the onboarding is closed (employee already
    // activated / cancelled), its tasks are frozen — no reverting a completed
    // task to Pending to silently un-activate the employee.
    const inst = await prisma.onboardingInstance.findFirst({
      where: { id: task.instanceId, orgId },
      select: { status: true },
    });
    if (inst && (inst.status === "OnboardCompleted" || inst.status === "OnboardCancelled")) {
      return conflict("This onboarding is already closed — its tasks can no longer be changed.");
    }

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

    if (status === "TaskCompleted" || status === "TaskSkipped") {
      // Scope completion to the instance's CURRENT phase — finishing every
      // pre-onboarding step must NOT complete/activate the whole onboarding.
      // (phase is a raw-SQL column.)
      const phaseRows = await prisma.$queryRaw<Array<{ phase: string | null }>>`
        SELECT phase FROM "app_quikhrms"."OnboardingInstance" WHERE id = ${task.instanceId} LIMIT 1`;
      const instPhase = phaseRows[0]?.phase ?? "Onboarding";

      const remainingRows = await prisma.$queryRaw<Array<{ n: bigint }>>`
        SELECT COUNT(*)::bigint AS n FROM "app_quikhrms"."OnboardingTask"
        WHERE "instanceId" = ${task.instanceId}
          AND phase = ${instPhase}
          AND status NOT IN ('TaskCompleted', 'TaskSkipped')`;
      const remaining = Number(remainingRows[0]?.n ?? 0);

      if (remaining === 0 && instPhase === "Onboarding") {
        // Onboarding fully done → complete the instance + activate the employee.
        const instance = await prisma.onboardingInstance.update({
          where: { id: task.instanceId },
          data: { status: "OnboardCompleted", completedAt: new Date(), updatedBy: userId },
        });
        await prisma.employee.update({
          where: { id: instance.employeeId },
          data: { status: "Active", inviteStatus: "Invited", updatedBy: userId },
        });
      } else if (remaining > 0) {
        // Automation chain: completing/skipping a step sends the next one.
        await advanceAutomation(task.instanceId, orgId);
      }
      // PreOnboarding fully done → no auto-complete/activate; HR clicks
      // "Move to Onboarding" to advance the lifecycle.
    }

    await createAuditLog({ orgId, userId, action: "Update", entityType: "OnboardingTask", entityId: taskId, changes: parsed.data });
    return successResponse(updated);
  } catch (error) {
    console.error("PUT /onboarding/tasks/[taskId] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });
