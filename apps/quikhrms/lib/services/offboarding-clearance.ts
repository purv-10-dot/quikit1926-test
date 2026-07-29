import { prisma } from "@/lib/prisma";

export interface ClearanceStatus {
  /** Whether the employee has an offboarding instance at all. */
  hasOffboarding: boolean;
  /** True when every clearance task is Completed/Skipped (or there are none). */
  complete: boolean;
  pending: number;
  total: number;
}

/**
 * Are all of an exiting employee's department clearances done? Used as a
 * blocking gate before releasing exit documents or the Full & Final settlement
 * (relieving/experience letters + F&F must wait until every clearance = Cleared).
 * No offboarding instance → not gated (complete: true).
 */
export async function getClearanceStatus(orgId: string, employeeId: string): Promise<ClearanceStatus> {
  const instance = await prisma.offboardingInstance.findFirst({
    where: { orgId, employeeId, deletedAt: null },
    include: { tasks: { select: { status: true } } },
  });
  if (!instance) return { hasOffboarding: false, complete: true, pending: 0, total: 0 };

  const total = instance.tasks.length;
  const done = instance.tasks.filter((t) => t.status === "TaskCompleted" || t.status === "TaskSkipped").length;
  return { hasOffboarding: true, complete: total === 0 ? true : done === total, pending: total - done, total };
}
