import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { initiateOnboardingSchema } from "@/lib/validations/boarding";
import { addDays } from "@/lib/services/boarding";
import { createAuditLog } from "@/lib/utils/audit";
import { fireWorkflow } from "@/lib/workflows/executor";
import { resolveAndSend } from "@/lib/email/resolve";
import { buildOnboardingTaskAssignedEmail } from "@/lib/email-templates/onboarding-task-assigned";

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

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = initiateOnboardingSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

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
              : (t.config?.assignEmployeeId as string) || null,
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

    // Notify each assigned employee about the onboarding task they own, linking
    // to the tracker where they can act on / complete it.
    const assignedTasks = instance.tasks.filter((t) => t.assigneeId);
    if (assignedTasks.length) {
      await prisma.hrmsNotification.createMany({
        data: assignedTasks.map((t) => ({
          orgId,
          employeeId: t.assigneeId as string,
          type: "Action" as const,
          channel: "InApp" as const,
          title: `Onboarding task assigned: ${t.title}`,
          message: "You have an onboarding task to complete.",
          link: `/onboarding/${parsed.data.employeeId}`,
          entityType: "OnboardingTask",
          entityId: t.id,
        })),
      }).catch((e) => console.error("onboarding task notify failed:", e));
    }

    // Email assignees of Custom Task steps — they just do the task and mark it
    // complete (other step types get their own action emails per type).
    const customByEmp = new Map<string, string[]>();
    for (const t of tasks) {
      const empId = t.config?.assignEmployeeId as string | undefined;
      if (!empId) continue;
      if ((t.stepType ?? "CustomTask") !== "CustomTask") continue;
      customByEmp.set(empId, [...(customByEmp.get(empId) ?? []), t.title]);
    }
    if (customByEmp.size) {
      try {
        const [company, emps, newHire] = await Promise.all([
          prisma.companySettings.findUnique({ where: { orgId }, select: { companyName: true } }),
          prisma.employee.findMany({ where: { orgId, id: { in: [...customByEmp.keys()] }, deletedAt: null }, select: { id: true, firstName: true, lastName: true, workEmail: true } }),
          prisma.employee.findFirst({ where: { id: parsed.data.employeeId, orgId }, select: { firstName: true, lastName: true } }),
        ]);
        const companyName = company?.companyName ?? "Our Company";
        const newHireName = newHire ? `${newHire.firstName} ${newHire.lastName}`.trim() : "the new hire";
        const base = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "";
        const link = `${base}/onboarding/${parsed.data.employeeId}`;
        for (const e of emps) {
          if (!e.workEmail) continue;
          const assigneeName = `${e.firstName} ${e.lastName}`.trim();
          const titles = customByEmp.get(e.id) ?? [];
          await resolveAndSend(orgId, {
            key: "onboarding.task-assigned",
            to: e.workEmail,
            vars: { assigneeName, companyName, newHireName },
            fallback: () => buildOnboardingTaskAssignedEmail({ assigneeName, companyName, newHireName, tasks: titles, link }),
          }).catch((err) => console.error("onboarding task email failed:", err));
        }
      } catch (e) {
        console.error("onboarding custom-task email block failed:", e);
      }
    }

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
