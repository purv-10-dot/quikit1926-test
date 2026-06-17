import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, notFound, internalError } from "@/lib/api-response";

export const GET = withAuth(async (_req: NextRequest, { orgId }, params) => {
  try {
    const instance = await prisma.offboardingInstance.findFirst({
      where: { orgId, employeeId: params.employeeId, deletedAt: null },
      include: { tasks: true },
    });
    if (!instance) return notFound("No offboarding found for employee");

    const byDept: Record<string, { department: string; total: number; completed: number; pending: number; blocked: number; tasks: typeof instance.tasks }> = {};

    for (const task of instance.tasks) {
      const key = task.department ?? "Unassigned";
      if (!byDept[key]) byDept[key] = { department: key, total: 0, completed: 0, pending: 0, blocked: 0, tasks: [] };
      byDept[key].total += 1;
      byDept[key].tasks.push(task);
      if (task.status === "TaskCompleted" || task.status === "TaskSkipped") byDept[key].completed += 1;
      else if (task.status === "TaskBlocked") byDept[key].blocked += 1;
      else byDept[key].pending += 1;
    }

    const groups = Object.values(byDept).map((g) => ({
      ...g,
      progress: g.total > 0 ? Math.round((g.completed / g.total) * 100) : 0,
      clearanceGranted: g.completed === g.total,
    }));

    const overallProgress = instance.tasks.length > 0
      ? Math.round((instance.tasks.filter((t) => t.status === "TaskCompleted" || t.status === "TaskSkipped").length / instance.tasks.length) * 100)
      : 0;

    return successResponse({
      offboardingId: instance.id,
      employeeId: instance.employeeId,
      status: instance.status,
      lastWorkingDate: instance.lastWorkingDate,
      overallProgress,
      groups,
    });
  } catch (error) {
    console.error("GET /offboarding/clearance/[employeeId] error:", error);
    return internalError();
  }
});
