import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { generateDocUploadToken } from "@/lib/services/doc-upload-token";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildDocUploadRequestEmail } from "@/lib/email-templates/doc-upload-request";
import { appBaseUrl } from "@/lib/utils/app-url";

// HR clicks "Send document request" on a Document Upload task in the onboarding
// checklist → emails the new hire a secure upload link and marks the task
// In Progress (Requested).
export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const task = await prisma.onboardingTask.findFirst({ where: { id: params.taskId, orgId } });
    if (!task) return notFound("Task not found");
    if (task.stepType !== "DocumentUpload") return validationError("This task is not a document-upload step.");

    const config = (task.config ?? {}) as Record<string, unknown>;
    const documents = Array.isArray(config.documents) ? (config.documents as string[]).filter((d) => d && d.trim()) : [];
    if (documents.length === 0) return validationError("No documents configured on this task.");

    const instance = await prisma.onboardingInstance.findFirst({
      where: { id: task.instanceId, orgId, deletedAt: null },
      select: { employeeId: true },
    });
    if (!instance) return notFound("Onboarding not found");

    const [candidate, company] = await Promise.all([
      prisma.employee.findFirst({ where: { id: instance.employeeId, orgId }, select: { firstName: true, lastName: true, workEmail: true, personalEmail: true } }),
      prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
    ]);
    const to = candidate?.workEmail || candidate?.personalEmail;
    if (!to) return validationError("The new hire has no email on file.");

    const { token } = generateDocUploadToken(task.id, orgId);
    const base = appBaseUrl();
    const link = `${base}/doc-upload/${token}`;
    const candidateName = candidate ? `${candidate.firstName} ${candidate.lastName}`.trim() : "there";
    const companyName = company?.companyName ?? "Our Company";

    const result = await resolveAndSend(orgId, {
      key: "onboarding.doc-upload-request",
      to,
      vars: { candidateName, companyName },
      fallback: () => buildDocUploadRequestEmail({ candidateName, companyName, documents, link }),
    });
    if (!result.sent) return internalError(`Mail send failed: ${result.error}`);

    await prisma.onboardingTask.update({
      where: { id: task.id },
      data: {
        status: "TaskInProgress",
        config: { ...config, requestSentAt: new Date().toISOString() },
        // completedBy stays null; assignee/updatedBy audit handled by caller.
      },
    });

    void userId;
    return successResponse({ sent: true, to });
  } catch (error) {
    console.error("POST /onboarding/tasks/[taskId]/doc-request error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"], rateLimit: { max: 10, windowSec: 60, scope: "onboarding.doc-request" } });
