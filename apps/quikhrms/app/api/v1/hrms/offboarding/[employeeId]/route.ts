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
      select: { id: true, firstName: true, lastName: true, displayName: true, employeeCode: true },
    });

    return successResponse({ ...instance, employee, progress, totalTasks: total, completedTasks: completed });
  } catch (error) {
    console.error("GET /offboarding/[employeeId] error:", error);
    return internalError();
  }
});
