import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";

export const GET = withAuth(async (_req: NextRequest, { orgId, userId }, params) => {
  try {
    let instance = await prisma.onboardingInstance.findFirst({
      where: { orgId, employeeId: params.employeeId, deletedAt: null },
      include: {
        tasks: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        template: { select: { id: true, name: true } },
      },
    });

    // Auto-create an empty onboarding instance if employee exists but record missing.
    if (!instance) {
      const emp = await prisma.employee.findFirst({
        where: { id: params.employeeId, orgId, deletedAt: null },
        select: { id: true },
      });
      if (!emp) return notFound("Employee not found");

      const startDate = new Date();
      const created = await prisma.onboardingInstance.create({
        data: {
          orgId,
          employeeId: emp.id,
          startDate,
          status: "NotStarted",
          createdBy: userId,
          updatedBy: userId,
        },
      });
      // No system-default tasks — the checklist comes from a template or is added
      // manually. A self-healed instance starts empty.

      instance = await prisma.onboardingInstance.findFirst({
        where: { id: created.id },
        include: {
          tasks: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
          template: { select: { id: true, name: true } },
        },
      });
    }
    if (!instance) return notFound("Onboarding not found");

    const total = instance.tasks.length;
    const completed = instance.tasks.filter((t) => t.status === "TaskCompleted" || t.status === "TaskSkipped").length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    const employee = await prisma.employee.findFirst({
      where: { id: instance.employeeId, orgId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
    });

    return successResponse({ ...instance, employee, progress, totalTasks: total, completedTasks: completed });
  } catch (error) {
    console.error("GET /onboarding/[employeeId] error:", error);
    return internalError();
  }
});
