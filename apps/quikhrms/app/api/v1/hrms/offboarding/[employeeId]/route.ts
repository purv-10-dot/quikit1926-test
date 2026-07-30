import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const instance = await prisma.offboardingInstance.findFirst({
      where: { orgId, employeeId: params.employeeId, deletedAt: null },
      include: {
        tasks: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    });
    if (!instance) return notFound("No offboarding found for employee");

    const total = instance.tasks.length;
    const completed = instance.tasks.filter((t) => t.status === "TaskCompleted" || t.status === "TaskSkipped").length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    // OffboardingInstance stores only employeeId (no Prisma relation), so resolve the name separately.
    const employee = await prisma.employee.findFirst({
      where: { orgId, id: instance.employeeId },
      select: {
        id: true, firstName: true, lastName: true, displayName: true, employeeCode: true, jobTitle: true,
        department: { select: { name: true } },
        designation: { select: { title: true } },
        reportingManager: { select: { firstName: true, lastName: true } },
      },
    });

    // Merge the rich workflow columns (not in the generated client) via raw SQL.
    const extra = await prisma.$queryRaw<Array<{ id: string; stepType: string | null; config: unknown; dueDate: Date | null }>>`
      SELECT id, "stepType", config, "dueDate" FROM "app_quikhrms"."OffboardingTask" WHERE "instanceId" = ${instance.id}`;
    const extraMap = new Map(extra.map((e) => [e.id, e]));
    const autoRows = await prisma.$queryRaw<Array<{ automated: boolean }>>`
      SELECT "automated" FROM "app_quikhrms"."OffboardingInstance" WHERE id = ${instance.id} LIMIT 1`;
    const tasks = instance.tasks.map((t) => {
      const e = extraMap.get(t.id);
      return { ...t, stepType: e?.stepType ?? null, config: e?.config ?? null, dueDate: e?.dueDate ?? null };
    });

    return successResponse({ ...instance, tasks, employee, automated: !!autoRows[0]?.automated, progress, totalTasks: total, completedTasks: completed });
  } catch (error) {
    console.error("GET /offboarding/[employeeId] error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.offboarding.read"] });
