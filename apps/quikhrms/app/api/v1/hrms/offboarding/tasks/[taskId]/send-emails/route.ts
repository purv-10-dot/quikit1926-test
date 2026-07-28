import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { sendStepEmails, advanceAutomation, finalizeOffboardingIfComplete } from "@/lib/services/offboarding-automation";

// HR clicks "Send now" on a Send Email offboarding step → sends every selected
// email (incl. the Resignation Acceptance PDF) to the exiting employee,
// completes the step, and advances the automation chain.
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; instanceId: string; title: string; status: string; stepType: string | null; config: Record<string, unknown> | null }>>`
      SELECT id, "instanceId", title, status, "stepType", config FROM "app_quikhrms"."OffboardingTask" WHERE id = ${params.taskId} AND "orgId" = ${orgId} LIMIT 1`;
    const task = rows[0];
    if (!task) return notFound("Task not found");
    if (task.stepType !== "SendEmail") return validationError("This step is not a Send Email step.");

    const keys = Array.isArray(task.config?.templates) ? (task.config!.templates as string[]).filter(Boolean) : [];
    if (!keys.length) return validationError("No email templates selected on this step.");

    const sent = await sendStepEmails(task, orgId);
    if (sent <= 0) return internalError("No emails could be sent — check the recipient has an email.");

    await prisma.offboardingTask.update({ where: { id: task.id }, data: { status: "TaskCompleted", completedAt: new Date(), completedBy: userId } });
    await prisma.$executeRaw`UPDATE "app_quikhrms"."OffboardingTask" SET config = ${JSON.stringify({ ...(task.config ?? {}), requestSentAt: new Date().toISOString() })}::jsonb WHERE id = ${task.id}`;
    // Shared finalization; if it didn't close the offboarding, chain automation.
    const finalized = await finalizeOffboardingIfComplete(task.instanceId, orgId, userId);
    if (!finalized) await advanceAutomation(task.instanceId, orgId);

    return successResponse({ sent });
  } catch (error) {
    console.error("POST /offboarding/tasks/[taskId]/send-emails error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"], rateLimit: { max: 10, windowSec: 60, scope: "offboarding.send-emails" } });
