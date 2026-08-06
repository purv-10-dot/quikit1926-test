import type { AuthContext } from "@/lib/types/api";
import { prisma } from "@/lib/prisma";
import { resolveEmployeeId } from "@/lib/resolve-employee";

interface TaskLike {
  assigneeId: string;
  requesterId: string | null;
  createdBy: string | null;
}

/**
 * Whether the caller may view or mutate a task. Allowed for an admin / task
 * manager (permissions "*" or hrms.task.read_all), or for a participant: the
 * assignee, the requester, the creator, or the assignee's reporting manager.
 */
export async function canActOnTask(ctx: AuthContext, task: TaskLike): Promise<boolean> {
  if (ctx.permissions.includes("*") || ctx.permissions.includes("hrms.task.read_all")) return true;

  const meId = await resolveEmployeeId(ctx.orgId, ctx.userId);
  // createdBy stores the auth userId; compare against both it and the resolved employee id.
  if (task.createdBy && (task.createdBy === ctx.userId || task.createdBy === meId)) return true;
  if (!meId) return false;
  if (task.assigneeId === meId || task.requesterId === meId) return true;

  // Assignee's reporting manager.
  const assignee = await prisma.employee.findFirst({
    where: { id: task.assigneeId, orgId: ctx.orgId, deletedAt: null },
    select: { reportingManagerId: true },
  });
  return !!assignee && assignee.reportingManagerId === meId;
}
