import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { initiateOffboardingSchema } from "@/lib/validations/boarding";
import { DEFAULT_OFFBOARDING_TASKS } from "@/lib/services/boarding";
import { createAuditLog } from "@/lib/utils/audit";
import { fireWorkflow } from "@/lib/workflows/executor";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = initiateOffboardingSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const existing = await prisma.offboardingInstance.findFirst({
      where: { orgId, employeeId: parsed.data.employeeId, deletedAt: null },
    });
    if (existing) return conflict("Employee already has an offboarding instance");

    const tasks = parsed.data.tasks && parsed.data.tasks.length > 0 ? parsed.data.tasks : DEFAULT_OFFBOARDING_TASKS;

    const instance = await prisma.offboardingInstance.create({
      data: {
        orgId,
        employeeId: parsed.data.employeeId,
        resignationDate: new Date(parsed.data.resignationDate),
        lastWorkingDate: new Date(parsed.data.lastWorkingDate),
        reason: parsed.data.reason,
        status: "OffboardInProgress",
        notes: parsed.data.notes,
        createdBy: userId,
        updatedBy: userId,
        tasks: {
          create: tasks.map((t, idx) => ({
            orgId,
            title: t.title,
            description: "description" in t ? t.description : undefined,
            assigneeId: "assigneeId" in t ? t.assigneeId ?? null : null,
            department: t.department ?? null,
            category: t.category as "Clearance",
            sortOrder: t.sortOrder ?? idx,
          })),
        },
      },
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
    });

    await prisma.employee.update({
      where: { id: parsed.data.employeeId },
      data: { status: "OnNotice", lastWorkingDate: new Date(parsed.data.lastWorkingDate) },
    }).catch(() => null);

    await createAuditLog({ orgId, userId, action: "Create", entityType: "OffboardingInstance", entityId: instance.id });

    void fireWorkflow({
      orgId,
      event: "offboarding.initiated",
      payload: {
        employeeId: parsed.data.employeeId,
        instanceId: instance.id,
        resignationDate: parsed.data.resignationDate,
        lastWorkingDate: parsed.data.lastWorkingDate,
        reason: parsed.data.reason,
      },
    });

    return successResponse(instance, undefined, 201);
  } catch (error) {
    console.error("POST /offboarding/initiate error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });
