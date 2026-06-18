import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const now = new Date();

    const [active, completed, cancelled, overdueTasks, pendingTasks, recentInstances] = await Promise.all([
      prisma.onboardingInstance.count({ where: { orgId, deletedAt: null, status: "InProgress" } }),
      prisma.onboardingInstance.count({ where: { orgId, deletedAt: null, status: "OnboardCompleted" } }),
      prisma.onboardingInstance.count({ where: { orgId, deletedAt: null, status: "OnboardCancelled" } }),
      prisma.onboardingTask.count({
        where: { orgId, dueDate: { lt: now }, status: { notIn: ["TaskCompleted", "TaskSkipped"] } },
      }),
      prisma.onboardingTask.count({
        where: { orgId, status: { in: ["TaskPending", "TaskInProgress"] } },
      }),
      prisma.onboardingInstance.findMany({
        where: { orgId, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { _count: { select: { tasks: true } } },
      }),
    ]);

    return successResponse({
      counts: { active, completed, cancelled, overdueTasks, pendingTasks },
      recentInstances,
    });
  } catch (error) {
    console.error("GET /onboarding/dashboard error:", error);
    return internalError();
  }
});
