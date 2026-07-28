import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { initiateOnboardingSchema } from "@/lib/validations/boarding";
import { addDays } from "@/lib/services/boarding";
import { createAuditLog } from "@/lib/utils/audit";
import { fireWorkflow } from "@/lib/workflows/executor";

type TaskTpl = {
  title: string;
  description?: string;
  assigneeRole: string;
  dueInDays: number;
  category: string;
  isMandatory: boolean;
  sortOrder: number;
  stepType?: string | null;
  // Workflow-builder config — carries the chosen department + employee the task
  // is assigned to (config.assignDepartmentId / config.assignEmployeeId).
  config?: Record<string, unknown> | null;
};

// Resolve the internal employees a step is assigned to (supports multiple).
// Returns [] for candidate-targeted steps. Falls back to the legacy single id.
function resolveAssignees(cfg: Record<string, unknown> | null | undefined): string[] {
  if (!cfg) return [];
  if (cfg.assignDepartmentId === "__candidate__") return [];
  const list = Array.isArray(cfg.assignEmployeeIds) ? (cfg.assignEmployeeIds as string[]).filter(Boolean) : [];
  if (list.length) return list;
  return cfg.assignEmployeeId ? [cfg.assignEmployeeId as string] : [];
}

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = initiateOnboardingSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    // Cross-tenant guard: the target employee must belong to the caller's org.
    // Without this, an org-A caller could initiate onboarding against an org-B
    // employee id (the instance orgId is the caller's, so it wouldn't otherwise
    // be caught).
    const targetEmp = await prisma.employee.findFirst({
      where: { id: parsed.data.employeeId, orgId, deletedAt: null },
      select: { id: true },
    });
    if (!targetEmp) return notFound("Employee not found");

    const existing = await prisma.onboardingInstance.findFirst({
      where: { orgId, employeeId: parsed.data.employeeId, deletedAt: null },
    });
    if (existing) return conflict("Employee already has an onboarding instance");

    let tasks: TaskTpl[] = (parsed.data.customTasks ?? []) as unknown as TaskTpl[];
    if (parsed.data.templateId) {
      const template = await prisma.onboardingTemplate.findFirst({
        where: { id: parsed.data.templateId, orgId, deletedAt: null },
      });
      if (!template) return notFound("Template not found");
      tasks = template.tasks as unknown as TaskTpl[];
    }

    if (!tasks || tasks.length === 0) {
      return validationError("Provide templateId or customTasks");
    }

    const startDate = new Date(parsed.data.startDate);

    const instance = await prisma.onboardingInstance.create({
      data: {
        orgId,
        employeeId: parsed.data.employeeId,
        templateId: parsed.data.templateId ?? null,
        startDate,
        status: "InProgress",
        notes: parsed.data.notes,
        createdBy: userId,
        updatedBy: userId,
        tasks: {
          create: tasks.map((t, idx) => ({
            orgId,
            title: t.title,
            description: t.description,
            assigneeRole: t.assigneeRole as "HRRole",
            // Assign to the picked employee, or to the new hire when the step
            // targets "Candidate".
            assigneeId: t.config?.assignDepartmentId === "__candidate__"
              ? parsed.data.employeeId
              : resolveAssignees(t.config)[0] || null,
            category: t.category as "Documentation",
            dueDate: addDays(startDate, t.dueInDays ?? 7),
            isMandatory: t.isMandatory,
            sortOrder: t.sortOrder ?? idx,
            // Persist the workflow step type + its config so per-type actions
            // (upload, approval, …) work on the live task.
            stepType: t.stepType ?? null,
            config: (t.config ?? undefined) as object | undefined,
          })),
        },
      },
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
    });

    // Notify EVERY assigned employee (a step can target multiple people) about
    // the onboarding task they own, linking to the tracker. Candidate-targeted
    // steps notify the new hire.
    const notifRows = instance.tasks.flatMap((t) => {
      const cfg = (t.config ?? {}) as Record<string, unknown>;
      const targets = cfg.assignDepartmentId === "__candidate__" ? [parsed.data.employeeId] : resolveAssignees(cfg);
      return targets.map((employeeId) => ({
        orgId,
        employeeId,
        type: "Action" as const,
        channel: "InApp" as const,
        title: `Onboarding task assigned: ${t.title}`,
        message: "You have an onboarding task to complete.",
        link: `/onboarding/${parsed.data.employeeId}`,
        entityType: "OnboardingTask",
        entityId: t.id,
      }));
    });
    if (notifRows.length) {
      await prisma.hrmsNotification.createMany({ data: notifRows })
        .catch((e) => console.error("onboarding task notify failed:", e));
    }

    // NOTE: assignee emails are NOT sent automatically here. HR sends them on
    // demand from the checklist ("Send to assignee") via the notify-assignees
    // route — this keeps the in-app bell above, but no surprise auto-emails.

    await createAuditLog({ orgId, userId, action: "Create", entityType: "OnboardingInstance", entityId: instance.id });

    void fireWorkflow({
      orgId,
      event: "onboarding.initiated",
      payload: {
        employeeId: parsed.data.employeeId,
        instanceId: instance.id,
        templateId: parsed.data.templateId ?? null,
        startDate,
      },
    });

    return successResponse(instance, undefined, 201);
  } catch (error) {
    console.error("POST /onboarding/initiate error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.onboarding.write"] });
