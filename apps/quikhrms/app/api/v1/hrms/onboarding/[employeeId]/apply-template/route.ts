import { NextRequest } from "next/server";
import { Prisma } from "@quikit/database";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { addDays, normalizeStepConfig } from "@/lib/services/boarding";
import { createAuditLog } from "@/lib/utils/audit";

type Tpl = {
  id?: string; title: string; description?: string; assigneeRole?: string; category?: string;
  dueInDays?: number; isMandatory?: boolean; sortOrder?: number; stepType?: string | null; config?: Record<string, unknown> | null;
};

// Runtime/progress data that lives inside a task's `config` JSON and must
// survive a template re-apply — everything ELSE in config is template-authored
// (document lists, policy files, BGV checks, assignees) and should refresh to
// match the latest template edit.
const RUNTIME_CONFIG_KEYS = ["uploads", "acks", "bgvStatus", "requestSentAt"] as const;

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
    // Re-apply: SYNC the checklist with the latest template instead of wiping
    // it. Steps are matched back to their existing OnboardingTask by the
    // template step's stable `id` (stored in the task's config as
    // `templateStepId`) — a matched step is updated in place (title, due date,
    // assignee, template-authored config) while its progress (uploads, acks,
    // BGV status, completion) is left untouched. A step no longer in the
    // template is removed; a step with no match (new, or predates step ids) is
    // created fresh.
    const replace = body?.replace === true;
    if (!templateId) return validationError("Choose a template.");

    const instance = await prisma.onboardingInstance.findFirst({
      where: { orgId, employeeId: params.employeeId, deletedAt: null },
      include: { tasks: { select: { id: true, stepType: true, sortOrder: true, config: true } } },
    });
    if (!instance) return notFound("Onboarding not found");

    // One instance holds BOTH checklists (pre-onboarding + onboarding), split by
    // the raw-SQL `phase` column. Everything below is scoped to the instance's
    // CURRENT phase — otherwise leftover onboarding-phase tasks make the
    // pre-onboarding checklist look "already populated" (and vice versa).
    const phaseRows = await prisma.$queryRaw<Array<{ phase: string | null }>>`
      SELECT phase FROM "app_quikhrms"."OnboardingInstance" WHERE id = ${instance.id} LIMIT 1`;
    const phase = phaseRows[0]?.phase ?? "Onboarding";
    const taskPhaseRows = await prisma.$queryRaw<Array<{ id: string; phase: string | null }>>`
      SELECT id, phase FROM "app_quikhrms"."OnboardingTask" WHERE "instanceId" = ${instance.id}`;
    const phaseOf = new Map(taskPhaseRows.map((r) => [r.id, r.phase ?? "Onboarding"]));
    const phaseTasks = instance.tasks.filter((t) => (phaseOf.get(t.id) ?? "Onboarding") === phase);

    // The auto system steps (Complete Profile for onboarding, BGV for
    // pre-onboarding) are never treated as template steps.
    const SYSTEM_STEPS = ["CompleteProfile", "BGV"];
    // Anything that is not a system step counts as an existing checklist step —
    // including plain tasks with no stepType (same rule the tracker UI uses).
    const hasTemplateSteps = phaseTasks.some((t) => !t.stepType || !SYSTEM_STEPS.includes(t.stepType));
    // First apply only allowed on an empty checklist; re-apply syncs instead.
    if (hasTemplateSteps && !replace) {
      return conflict(phase === "PreOnboarding"
        ? "This pre-onboarding already has steps."
        : "This onboarding already has steps.");
    }

    const template = await prisma.onboardingTemplate.findFirst({ where: { id: templateId, orgId, deletedAt: null } });
    if (!template) return notFound("Template not found");
    const tasks = (template.tasks as unknown as Tpl[]) ?? [];
    if (!tasks.length) return validationError("That template has no steps.");

    const startDate = new Date(instance.startDate);
    const nonSystemPhaseTasks = phaseTasks.filter((t) => t.sortOrder !== -1);

    let createdCount = 0;
    let updatedCount = 0;
    let removedCount = 0;
    const newTaskIds: string[] = [];

    if (replace) {
      // Match existing tasks to template steps by the stable id stashed in
      // config.templateStepId at the time they were created/last synced.
      const existingByStepId = new Map<string, { id: string; config: Record<string, unknown> | null }>();
      for (const t of nonSystemPhaseTasks) {
        const stepId = (t.config as Record<string, unknown> | null)?.templateStepId;
        if (typeof stepId === "string") existingByStepId.set(stepId, { id: t.id, config: t.config as Record<string, unknown> | null });
      }
      const matchedStepIds = new Set<string>();

      for (let idx = 0; idx < tasks.length; idx++) {
        const t = tasks[idx];
        const existing = t.id ? existingByStepId.get(t.id) : undefined;
        const normalizedConfig = normalizeStepConfig(t.stepType, t.config) ?? {};
        const assigneeId = t.config?.assignDepartmentId === "__candidate__" ? params.employeeId : resolveAssignees(t.config)[0] || null;

        if (existing) {
          matchedStepIds.add(t.id!);
          const mergedConfig: Record<string, unknown> = { ...normalizedConfig, templateStepId: t.id };
          const oldConfig = existing.config ?? {};
          for (const key of RUNTIME_CONFIG_KEYS) {
            if (oldConfig[key] !== undefined) mergedConfig[key] = oldConfig[key];
          }
          await prisma.onboardingTask.update({
            where: { id: existing.id },
            data: {
              title: t.title,
              description: t.description,
              assigneeRole: (t.assigneeRole as "HRRole") ?? "HRRole",
              assigneeId,
              category: (t.category as "Documentation") ?? "TaskOther",
              dueDate: addDays(startDate, t.dueInDays ?? 7),
              isMandatory: t.isMandatory ?? true,
              sortOrder: idx,
              stepType: t.stepType ?? null,
              config: JSON.parse(JSON.stringify(mergedConfig)),
            },
          });
          updatedCount++;
        } else {
          const created = await prisma.onboardingTask.create({
            data: {
              orgId,
              instanceId: instance.id,
              title: t.title,
              description: t.description,
              assigneeRole: (t.assigneeRole as "HRRole") ?? "HRRole",
              assigneeId,
              category: (t.category as "Documentation") ?? "TaskOther",
              dueDate: addDays(startDate, t.dueInDays ?? 7),
              isMandatory: t.isMandatory ?? true,
              sortOrder: idx,
              stepType: t.stepType ?? null,
              config: JSON.parse(JSON.stringify(t.id ? { ...normalizedConfig, templateStepId: t.id } : normalizedConfig)) as object | undefined,
            },
            select: { id: true },
          });
          newTaskIds.push(created.id);
          createdCount++;
        }
      }

      // A tagged task whose step id no longer appears in the template was
      // deleted/renamed away in the template — remove it. Untagged tasks
      // (predate step ids, or manually added outside the template) are never
      // touched, so pre-existing checklists can't lose data to this sync.
      const toRemove = nonSystemPhaseTasks.filter((t) => {
        const stepId = (t.config as Record<string, unknown> | null)?.templateStepId;
        return typeof stepId === "string" && !matchedStepIds.has(stepId);
      });
      if (toRemove.length) {
        await prisma.onboardingTask.deleteMany({ where: { orgId, id: { in: toRemove.map((t) => t.id) } } });
        removedCount = toRemove.length;
      }
    } else {
      // First apply — empty checklist, plain insert.
      const created = await Promise.all(tasks.map(async (t, idx) => {
        const normalizedConfig = normalizeStepConfig(t.stepType, t.config) ?? {};
        const row = await prisma.onboardingTask.create({
          data: {
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
            config: JSON.parse(JSON.stringify(t.id ? { ...normalizedConfig, templateStepId: t.id } : normalizedConfig)) as object | undefined,
          },
          select: { id: true },
        });
        return row.id;
      }));
      newTaskIds.push(...created);
      createdCount = created.length;
    }

    // Tag every newly-created row with the instance's phase (defaults to
    // 'Onboarding' on insert — only needs a raw UPDATE when this instance is
    // actually in the PreOnboarding phase).
    if (phase !== "Onboarding" && newTaskIds.length) {
      await prisma.$executeRaw`
        UPDATE "app_quikhrms"."OnboardingTask" SET phase = ${phase}
        WHERE id IN (${Prisma.join(newTaskIds)})`;
    }

    // BGV is both an auto system step (pre-onboarding) AND a step a template can
    // include. If the template supplies its own BGV, drop the auto-injected one
    // (sortOrder -1) so BGV appears exactly once — current phase only.
    if (tasks.some((t) => t.stepType === "BGV")) {
      const autoBgvIds = phaseTasks.filter((t) => t.stepType === "BGV" && t.sortOrder === -1).map((t) => t.id);
      if (autoBgvIds.length) {
        await prisma.onboardingTask.deleteMany({ where: { orgId, id: { in: autoBgvIds } } });
      }
    }

    await prisma.onboardingInstance.update({
      where: { id: instance.id },
      data: { templateId, status: instance.status === "NotStarted" ? "InProgress" : instance.status, updatedBy: userId },
    });

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "OnboardingInstance", entityId: instance.id,
      metadata: { appliedTemplate: templateId, replace, created: createdCount, updated: updatedCount, removed: removedCount },
    });
    return successResponse({ created: createdCount, updated: updatedCount, removed: removedCount });
  } catch (error) {
    console.error("POST /onboarding/[employeeId]/apply-template error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });
