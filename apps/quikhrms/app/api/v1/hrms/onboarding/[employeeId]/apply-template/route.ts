import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { addDays } from "@/lib/services/boarding";
import { createAuditLog } from "@/lib/utils/audit";

type Tpl = { title: string; description?: string; assigneeRole?: string; category?: string; dueInDays?: number; isMandatory?: boolean; sortOrder?: number; stepType?: string | null; config?: Record<string, unknown> | null };

function resolveAssignees(cfg: Record<string, unknown> | null | undefined): string[] {
  if (!cfg) return [];
  if (cfg.assignDepartmentId === "__candidate__") return [];
  const list = Array.isArray(cfg.assignEmployeeIds) ? (cfg.assignEmployeeIds as string[]).filter(Boolean) : [];
  if (list.length) return list;
  return cfg.assignEmployeeId ? [cfg.assignEmployeeId as string] : [];
}

// POST /onboarding/:employeeId/apply-template  { templateId }
// Populates an onboarding that has no template steps yet (only the auto
// Complete Profile step) from a chosen template.
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json().catch(() => ({}));
    const templateId = typeof body?.templateId === "string" ? body.templateId : "";
    // Re-apply: rebuild the checklist from the latest template. Deletes the
    // current template-copied steps (keeping the auto system step) and re-copies.
    const replace = body?.replace === true;
    if (!templateId) return validationError("Choose a template.");

    const instance = await prisma.onboardingInstance.findFirst({
      where: { orgId, employeeId: params.employeeId, deletedAt: null },
      include: { tasks: { select: { stepType: true } } },
    });
    if (!instance) return notFound("Onboarding not found");

    // The auto system steps (Complete Profile for onboarding, BGV for
    // pre-onboarding) are never treated as template steps.
    const SYSTEM_STEPS = ["CompleteProfile", "BGV"];
    const hasTemplateSteps = instance.tasks.some((t) => t.stepType && !SYSTEM_STEPS.includes(t.stepType));
    // First apply only allowed on an empty checklist; re-apply clears first.
    if (hasTemplateSteps && !replace) return conflict("This onboarding already has steps.");

    const template = await prisma.onboardingTemplate.findFirst({ where: { id: templateId, orgId, deletedAt: null } });
    if (!template) return notFound("Template not found");
    const tasks = (template.tasks as unknown as Tpl[]) ?? [];
    if (!tasks.length) return validationError("That template has no steps.");

    const startDate = new Date(instance.startDate);

    // Re-apply: drop everything except the auto system step (injected with
    // sortOrder -1) so template edits — including renamed/removed steps — fully
    // rebuild the checklist without leaving stale copies behind.
    if (replace) {
      await prisma.onboardingTask.deleteMany({
        where: { orgId, instanceId: instance.id, sortOrder: { not: -1 } },
      });
    }

    await prisma.onboardingTask.createMany({
      data: tasks.map((t, idx) => ({
        orgId,
        instanceId: instance.id,
        title: t.title,
        description: t.description,
        assigneeRole: (t.assigneeRole as "HRRole") ?? "HRRole",
        assigneeId: t.config?.assignDepartmentId === "__candidate__" ? params.employeeId : resolveAssignees(t.config)[0] || null,
        category: (t.category as "Documentation") ?? "TaskOther",
        dueDate: addDays(startDate, t.dueInDays ?? 7),
        isMandatory: t.isMandatory ?? true,
        sortOrder: t.sortOrder ?? idx,
        stepType: t.stepType ?? null,
        config: (t.config ?? undefined) as object | undefined,
      })),
    });

    // BGV is both an auto system step (pre-onboarding) AND a step a template can
    // include. If the template supplies its own BGV, drop the auto-injected one
    // (sortOrder -1) so BGV appears exactly once.
    if (tasks.some((t) => t.stepType === "BGV")) {
      await prisma.onboardingTask.deleteMany({
        where: { orgId, instanceId: instance.id, stepType: "BGV", sortOrder: -1 },
      });
    }

    await prisma.onboardingInstance.update({
      where: { id: instance.id },
      data: { templateId, status: instance.status === "NotStarted" ? "InProgress" : instance.status, updatedBy: userId },
    });

    await createAuditLog({ orgId, userId, action: "Update", entityType: "OnboardingInstance", entityId: instance.id, metadata: { appliedTemplate: templateId } });
    return successResponse({ created: tasks.length });
  } catch (error) {
    console.error("POST /onboarding/[employeeId]/apply-template error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });
