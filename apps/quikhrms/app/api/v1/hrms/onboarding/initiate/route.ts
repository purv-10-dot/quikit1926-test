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

    let tasks: TaskTpl[] = parsed.data.customTasks ?? [];
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
            category: t.category as "Documentation",
            dueDate: addDays(startDate, t.dueInDays ?? 7),
            isMandatory: t.isMandatory,
            sortOrder: t.sortOrder ?? idx,
          })),
        },
      },
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
    });

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
