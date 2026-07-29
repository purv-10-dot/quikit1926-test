import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, internalError } from "@/lib/api-response";
import { generateTaskActionToken } from "@/lib/services/task-action-token";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildTaskAssignedActionEmail } from "@/lib/email-templates/task-assigned-action";

// HR clicks "Send to assignee(s)" on a staff-assigned step (Custom Task / Asset /
// IT Provisioning) → emails every assigned employee a one-click "Mark as done"
// link and marks the task In Progress (Requested). Mirrors the doc-request flow.
const ACTION_STEP_TYPES = new Set(["CustomTask", "AssetAssignment", "ITProvisioning"]);

function resolveAssignees(cfg: Record<string, unknown>): string[] {
  if (cfg.assignDepartmentId === "__candidate__") return [];
  const list = Array.isArray(cfg.assignEmployeeIds) ? (cfg.assignEmployeeIds as string[]).filter(Boolean) : [];
  if (list.length) return list;
  return cfg.assignEmployeeId ? [cfg.assignEmployeeId as string] : [];
}

function actionDetail(stepType: string | null | undefined, cfg: Record<string, unknown>): string | undefined {
  const st = stepType ?? "CustomTask";
  if (st === "AssetAssignment") {
    const list = Array.isArray(cfg.assets) ? (cfg.assets as { type: string; qty?: number; custom?: string }[]) : [];
    if (list.length) return list.map((a) => `${a.type === "Custom" ? (a.custom?.trim() || "Custom") : a.type} ×${a.qty || 1}`).join(", ");
    return [cfg.asset, cfg.quantity ? `×${cfg.quantity}` : ""].filter(Boolean).join(" ").trim() || undefined;
  }
  if (st === "ITProvisioning") {
    const list = Array.isArray(cfg.systems) ? (cfg.systems as string[]) : [];
    const other = typeof cfg.otherSystems === "string" ? cfg.otherSystems.split(",").map((s) => s.trim()).filter(Boolean) : [];
    const all = [...list, ...other];
    if (all.length) return all.join(", ");
    return cfg.system ? String(cfg.system) : undefined;
  }
  return undefined;
}

export const POST = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    const task = await prisma.onboardingTask.findFirst({ where: { id: params.taskId, orgId } });
    if (!task) return notFound("Task not found");
    if (!ACTION_STEP_TYPES.has(task.stepType ?? "CustomTask")) return validationError("This step can't be sent to an assignee.");

    const cfg = (task.config ?? {}) as Record<string, unknown>;
    const assigneeIds = resolveAssignees(cfg);
    if (assigneeIds.length === 0) return validationError("No employees are assigned to this step.");

    const instance = await prisma.onboardingInstance.findFirst({
      where: { id: task.instanceId, orgId, deletedAt: null },
      select: { employeeId: true },
    });
    if (!instance) return notFound("Onboarding not found");

    const [company, emps, newHire] = await Promise.all([
      prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
      prisma.employee.findMany({ where: { orgId, id: { in: assigneeIds }, deletedAt: null }, select: { id: true, firstName: true, lastName: true, workEmail: true } }),
      prisma.employee.findFirst({ where: { id: instance.employeeId, orgId }, select: { firstName: true, lastName: true } }),
    ]);
    const companyName = company?.companyName ?? "Our Company";
    const newHireName = newHire ? `${newHire.firstName} ${newHire.lastName}`.trim() : "the new hire";
    const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
    const appLink = `${base}/onboarding/${instance.employeeId}`;
    const detail = actionDetail(task.stepType, cfg);

    let sent = 0;
    for (const e of emps) {
      if (!e.workEmail) continue;
      const assigneeName = `${e.firstName} ${e.lastName}`.trim();
      const { token } = generateTaskActionToken(task.id, orgId, e.id);
      const doneLink = `${base}/task-done/${token}`;
      const result = await resolveAndSend(orgId, {
        key: "onboarding.task-assigned",
        to: e.workEmail,
        vars: { assigneeName, companyName, newHireName },
        fallback: () => buildTaskAssignedActionEmail({ assigneeName, companyName, newHireName, taskTitle: task.title, detail, doneLink, appLink }),
      });
      if (result.sent) sent++;
    }
    if (sent === 0) return internalError("No emails could be sent — check assignees have work emails.");

    await prisma.onboardingTask.update({
      where: { id: task.id },
      data: {
        status: task.status === "TaskCompleted" ? task.status : "TaskInProgress",
        config: { ...cfg, requestSentAt: new Date().toISOString() },
      },
    });

    void userId;
    return successResponse({ sent });
  } catch (error) {
    console.error("POST /onboarding/tasks/[taskId]/notify-assignees error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"], rateLimit: { max: 10, windowSec: 60, scope: "onboarding.notify-assignees" } });
