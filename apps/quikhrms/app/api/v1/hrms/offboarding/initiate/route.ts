import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { initiateOffboardingSchema } from "@/lib/validations/boarding";
import { addDays } from "@/lib/services/boarding";
import { createAuditLog } from "@/lib/utils/audit";
import { fireWorkflow } from "@/lib/workflows/executor";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = initiateOffboardingSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    // Verify the employee exists in this org (employeeId has no FK relation, so a
    // bad id would otherwise create an orphan instance silently).
    const employee = await prisma.employee.findFirst({
      where: { id: parsed.data.employeeId, orgId, deletedAt: null },
      select: { id: true, dateOfJoining: true },
    });
    if (!employee) return validationError("Employee not found.");

    // Last working date is derived from the chosen notice period master:
    // resignation date + (duration × unit). Raw SQL so this works without
    // regenerating the Prisma client.
    const npRows = await prisma.$queryRaw<Array<{ duration: number; unit: string }>>`
      SELECT duration, unit::text AS unit
      FROM "app_quikhrms"."NoticePeriod"
      WHERE id = ${parsed.data.noticePeriodId} AND "orgId" = ${orgId} AND "deletedAt" IS NULL
      LIMIT 1
    `;
    if (!npRows.length) return validationError("Notice period not found.");
    const noticePeriod = npRows[0];

    const resignationDate = new Date(parsed.data.resignationDate);
    const lastWorkingDate = new Date(resignationDate);
    if (noticePeriod.unit === "Months") {
      lastWorkingDate.setMonth(lastWorkingDate.getMonth() + noticePeriod.duration);
    } else {
      const days = noticePeriod.unit === "Weeks" ? noticePeriod.duration * 7 : noticePeriod.duration;
      lastWorkingDate.setDate(lastWorkingDate.getDate() + days);
    }

    if (employee.dateOfJoining && lastWorkingDate < new Date(employee.dateOfJoining)) {
      return validationError("Last working date cannot be before the joining date.");
    }

    const existing = await prisma.offboardingInstance.findFirst({
      where: { orgId, employeeId: parsed.data.employeeId, deletedAt: null },
    });
    if (existing) return conflict("Employee already has an offboarding instance");

    // Task source: explicit tasks → chosen template's tasks → EMPTY.
    // No system-default checklist — the list comes from a template or is added
    // manually (mirrors onboarding, which also starts empty).
    type OffTask = { title: string; description?: string; assigneeId?: string | null; department?: string | null; category: string; sortOrder?: number; stepType?: string | null; config?: Record<string, unknown> | null; dueInDays?: number };
    let templateTasks: OffTask[] | null = null;
    if (parsed.data.templateId) {
      const rows = await prisma.$queryRaw<Array<{ tasks: unknown }>>`
        SELECT tasks FROM "app_quikhrms"."OffboardingTemplate"
        WHERE id = ${parsed.data.templateId} AND "orgId" = ${orgId} AND "deletedAt" IS NULL
        LIMIT 1
      `;
      if (!rows.length) return validationError("Offboarding template not found.");
      templateTasks = Array.isArray(rows[0].tasks) ? (rows[0].tasks as OffTask[]) : null;
    }
    const tasks: OffTask[] = parsed.data.tasks && parsed.data.tasks.length > 0
      ? (parsed.data.tasks as OffTask[])
      : (templateTasks ?? []);

    const instance = await prisma.offboardingInstance.create({
      data: {
        orgId,
        employeeId: parsed.data.employeeId,
        resignationDate,
        lastWorkingDate,
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

    // Link the chosen notice period via raw SQL (column not in the current
    // generated client).
    await prisma.$executeRaw`
      UPDATE "app_quikhrms"."OffboardingInstance"
      SET "noticePeriodId" = ${parsed.data.noticePeriodId}, "templateId" = ${parsed.data.templateId ?? null}
      WHERE id = ${instance.id}
    `;

    // Persist the rich workflow fields (stepType / config / dueDate) on each task
    // via raw SQL — new columns, not in the generated client. instance.tasks and
    // `tasks` are both in sortOrder, so they line up by index.
    for (let i = 0; i < instance.tasks.length; i++) {
      const src = tasks[i];
      const created = instance.tasks[i];
      if (!src || !created) continue;
      const dueDate = typeof src.dueInDays === "number" ? addDays(resignationDate, src.dueInDays) : null;
      await prisma.$executeRaw`
        UPDATE "app_quikhrms"."OffboardingTask"
        SET "stepType" = ${src.stepType ?? null},
            "config" = ${src.config ? JSON.stringify(src.config) : null}::jsonb,
            "dueDate" = ${dueDate}
        WHERE id = ${created.id}
      `;
    }

    await prisma.employee.update({
      where: { id: parsed.data.employeeId },
      data: { status: "OnNotice", lastWorkingDate },
    }).catch(() => null);

    await createAuditLog({ orgId, userId, action: "Create", entityType: "OffboardingInstance", entityId: instance.id });

    void fireWorkflow({
      orgId,
      event: "offboarding.initiated",
      payload: {
        employeeId: parsed.data.employeeId,
        instanceId: instance.id,
        resignationDate: parsed.data.resignationDate,
        lastWorkingDate: lastWorkingDate.toISOString().slice(0, 10),
        reason: parsed.data.reason,
      },
    });

    return successResponse(instance, undefined, 201);
  } catch (error) {
    console.error("POST /offboarding/initiate error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });
