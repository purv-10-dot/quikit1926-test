import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { addDays } from "@/lib/services/boarding";
import { createAuditLog } from "@/lib/utils/audit";

type OffTask = { title: string; description?: string; assigneeId?: string | null; department?: string | null; category?: string; sortOrder?: number; stepType?: string | null; config?: Record<string, unknown> | null; dueInDays?: number };

// POST /offboarding/:employeeId/apply-template  { templateId }
// Populates an EMPTY offboarding's checklist from a chosen template (for
// offboardings that were started without one).
export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const body = await req.json().catch(() => ({}));
    const templateId = typeof body?.templateId === "string" ? body.templateId : "";
    // Re-apply: rebuild the checklist from the latest template (deletes the
    // current steps first). First apply is only allowed on an empty checklist.
    const replace = body?.replace === true;
    if (!templateId) return validationError("Choose a template.");

    const instance = await prisma.offboardingInstance.findFirst({
      where: { orgId, employeeId: params.employeeId, deletedAt: null },
      include: { tasks: { select: { id: true } } },
    });
    if (!instance) return notFound("Offboarding not found");
    if (instance.tasks.length > 0 && !replace) return conflict("This offboarding already has steps.");

    // Re-apply clears the existing steps so the re-copied list aligns with the template.
    if (replace) {
      await prisma.offboardingTask.deleteMany({ where: { orgId, instanceId: instance.id } });
    }

    const rows = await prisma.$queryRaw<Array<{ tasks: unknown }>>`
      SELECT tasks FROM "app_quikhrms"."OffboardingTemplate"
      WHERE id = ${templateId} AND "orgId" = ${orgId} AND "deletedAt" IS NULL LIMIT 1`;
    if (!rows.length) return notFound("Template not found");
    const tasks = (Array.isArray(rows[0].tasks) ? rows[0].tasks : []) as OffTask[];
    if (!tasks.length) return validationError("That template has no steps.");

    const resignationDate = new Date(instance.resignationDate);

    await prisma.offboardingTask.createMany({
      data: tasks.map((t, idx) => ({
        orgId,
        instanceId: instance.id,
        title: t.title,
        description: t.description ?? null,
        assigneeId: t.assigneeId ?? null,
        department: t.department ?? null,
        category: (t.category as "Clearance") ?? "Clearance",
        sortOrder: t.sortOrder ?? idx,
      })),
    });

    // Set the rich columns (stepType/config/dueDate) via raw SQL — new columns
    // not in the generated client. Both lists are in sortOrder, so they align.
    const created = await prisma.offboardingTask.findMany({
      where: { instanceId: instance.id, orgId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    for (let i = 0; i < created.length; i++) {
      const src = tasks[i];
      if (!src) continue;
      const dueDate = typeof src.dueInDays === "number" ? addDays(resignationDate, src.dueInDays) : null;
      await prisma.$executeRaw`
        UPDATE "app_quikhrms"."OffboardingTask"
        SET "stepType" = ${src.stepType ?? null},
            "config" = ${src.config ? JSON.stringify(src.config) : null}::jsonb,
            "dueDate" = ${dueDate}
        WHERE id = ${created[i].id}`;
    }

    await prisma.$executeRaw`UPDATE "app_quikhrms"."OffboardingInstance" SET "templateId" = ${templateId} WHERE id = ${instance.id}`;
    await createAuditLog({ orgId, userId, action: "Update", entityType: "OffboardingInstance", entityId: instance.id, metadata: { appliedTemplate: templateId } });

    return successResponse({ created: created.length });
  } catch (error) {
    console.error("POST /offboarding/[employeeId]/apply-template error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.write"] });
