import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { sendStepEmails, advanceAutomation } from "@/lib/services/onboarding-automation";

// HR clicks "Send now" on a Send Email step → sends every selected template to
// the new hire, completes the step, and advances the automation chain.
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const task = await prisma.onboardingTask.findFirst({ where: { id: params.taskId, orgId } });
    if (!task) return notFound("Task not found");
    if (task.stepType !== "SendEmail") return validationError("This step is not a Send Email step.");

    const cfg = (task.config ?? {}) as Record<string, unknown>;
    const keys = Array.isArray(cfg.templates) ? (cfg.templates as string[]).filter(Boolean) : (cfg.template ? [cfg.template as string] : []);
    if (!keys.length) return validationError("No email templates selected on this step.");

    const sent = await sendStepEmails(
      { id: task.id, instanceId: task.instanceId, title: task.title, status: task.status, stepType: task.stepType, config: task.config },
      orgId,
    );
    if (sent <= 0) return internalError("No emails could be sent — check the recipient has an email.");

    await prisma.onboardingTask.update({
      where: { id: task.id },
      data: { status: "TaskCompleted", completedAt: new Date(), completedBy: userId, config: JSON.parse(JSON.stringify({ ...cfg, requestSentAt: new Date().toISOString() })) },
    });
    await advanceAutomation(task.instanceId, orgId);

    return successResponse({ sent });
  } catch (error) {
    console.error("POST /onboarding/tasks/[taskId]/send-emails error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"], rateLimit: { max: 10, windowSec: 60, scope: "onboarding.send-emails" } });
