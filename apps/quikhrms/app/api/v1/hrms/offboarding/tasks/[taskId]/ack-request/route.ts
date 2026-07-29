import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { generateDocUploadToken } from "@/lib/services/doc-upload-token";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildPolicyAckRequestEmail } from "@/lib/email-templates/policy-ack-request";

interface PolicyFile { url: string; fileName: string }

// HR sends the exiting employee a secure link to re-acknowledge policy files
// (NDA/confidentiality) on a Policy Re-acknowledge offboarding step.
export const POST = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; instanceId: string; stepType: string | null; config: Record<string, unknown> | null }>>`
      SELECT id, "instanceId", "stepType", config FROM "app_quikhrms"."OffboardingTask" WHERE id = ${params.taskId} AND "orgId" = ${orgId} LIMIT 1`;
    const task = rows[0];
    if (!task) return notFound("Task not found");
    if (task.stepType !== "ReadPolicy") return validationError("This step is not a policy re-acknowledge step.");

    const cfg = (task.config ?? {}) as Record<string, unknown>;
    const files = Array.isArray(cfg.files) ? (cfg.files as PolicyFile[]).filter((f) => f && f.url) : [];
    if (!files.length) return validationError("No files attached to this step yet.");

    const instance = await prisma.offboardingInstance.findFirst({ where: { id: task.instanceId, orgId, deletedAt: null }, select: { employeeId: true } });
    if (!instance) return notFound("Offboarding not found");

    const [emp, company] = await Promise.all([
      prisma.employee.findFirst({ where: { id: instance.employeeId, orgId }, select: { firstName: true, lastName: true, workEmail: true, personalEmail: true } }),
      prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
    ]);
    const to = emp?.workEmail || emp?.personalEmail;
    if (!to) return validationError("The employee has no email on file.");

    const { token } = generateDocUploadToken(task.id, orgId);
    const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
    const link = `${base}/exit-ack/${token}`;
    const candidateName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : "there";
    const companyName = company?.companyName ?? "Our Company";

    const result = await resolveAndSend(orgId, {
      key: "onboarding.policy-ack-request",
      to,
      vars: { candidateName, companyName },
      fallback: () => buildPolicyAckRequestEmail({ candidateName, companyName, files: files.map((f) => f.fileName), link }),
    });
    if (!result.sent) return internalError(`Mail send failed: ${result.error}`);

    await prisma.$executeRaw`
      UPDATE "app_quikhrms"."OffboardingTask" SET config = ${JSON.stringify({ ...cfg, requestSentAt: new Date().toISOString() })}::jsonb WHERE id = ${task.id}`;
    await prisma.offboardingTask.update({ where: { id: task.id }, data: { status: "TaskInProgress" } });

    return successResponse({ sent: true, to });
  } catch (error) {
    console.error("POST /offboarding/tasks/[taskId]/ack-request error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });
