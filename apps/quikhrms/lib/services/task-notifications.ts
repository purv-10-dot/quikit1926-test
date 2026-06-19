import { prisma } from "@/lib/prisma";
import { publishNotification } from "@/lib/services/realtime";

interface TaskLite {
  id: string;
  title: string;
  assigneeId: string;
  requesterId: string | null;
}

const inAppLink = (id: string) => `/tasks?id=${id}`;

async function getName(orgId: string, employeeId: string): Promise<string> {
  const e = await prisma.employee.findFirst({
    where: { id: employeeId, orgId, deletedAt: null },
    select: { firstName: true, lastName: true },
  });
  return e ? `${e.firstName} ${e.lastName}`.trim() : "Someone";
}

interface NotifyArgs {
  orgId: string;
  recipients: string[];
  taskId: string;
  title: string;
  message: string;
  type?: "Info" | "Success" | "Warning" | "Error" | "Action";
}

async function notify(args: NotifyArgs) {
  const unique = [...new Set(args.recipients.filter(Boolean))];
  if (unique.length === 0) return;

  await prisma.hrmsNotification.createMany({
    data: unique.map((employeeId) => ({
      orgId: args.orgId,
      employeeId,
      type: args.type ?? "Action",
      channel: "InApp" as const,
      title: args.title,
      message: args.message,
      link: inAppLink(args.taskId),
      entityType: "Task",
      entityId: args.taskId,
    })),
  });

  publishNotification(args.orgId, unique, {
    title: args.title,
    message: args.message,
    type: args.type ?? "Action",
    link: inAppLink(args.taskId),
  }).catch(() => {});
}

export async function notifyTaskAssigned(
  orgId: string,
  task: TaskLite,
  actorId: string,
) {
  if (task.assigneeId === actorId) return;
  try {
    const actorName = task.requesterId
      ? await getName(orgId, task.requesterId)
      : "Someone";

    await notify({
      orgId,
      recipients: [task.assigneeId],
      taskId: task.id,
      type: "Action",
      title: `New task assigned: ${task.title}`,
      message: `${actorName} assigned a task to you.`,
    });
  } catch (error) {
    console.error("notifyTaskAssigned error:", error);
  }
}

export async function notifyTaskReassigned(
  orgId: string,
  task: TaskLite,
  oldAssigneeId: string,
  actorId: string,
) {
  try {
    const actorName = await getName(orgId, actorId);
    const recipients: string[] = [];
    if (task.assigneeId !== actorId) recipients.push(task.assigneeId);
    if (oldAssigneeId && oldAssigneeId !== actorId && oldAssigneeId !== task.assigneeId) {
      recipients.push(oldAssigneeId);
    }
    if (recipients.length === 0) return;

    await notify({
      orgId,
      recipients,
      taskId: task.id,
      type: "Info",
      title: `Task reassigned: ${task.title}`,
      message: `${actorName} reassigned the task.`,
    });
  } catch (error) {
    console.error("notifyTaskReassigned error:", error);
  }
}

export async function notifyTaskCompleted(
  orgId: string,
  task: TaskLite,
  actorId: string,
) {
  try {
    if (!task.requesterId || task.requesterId === actorId) return;
    const actorName = await getName(orgId, actorId);

    await notify({
      orgId,
      recipients: [task.requesterId],
      taskId: task.id,
      type: "Success",
      title: `Task completed: ${task.title}`,
      message: `${actorName} marked the task as completed.`,
    });
  } catch (error) {
    console.error("notifyTaskCompleted error:", error);
  }
}

export async function notifyTaskCommented(
  orgId: string,
  task: TaskLite,
  actorId: string,
) {
  try {
    const actorName = await getName(orgId, actorId);
    const recipients: string[] = [];
    if (task.assigneeId && task.assigneeId !== actorId) recipients.push(task.assigneeId);
    if (task.requesterId && task.requesterId !== actorId) recipients.push(task.requesterId);
    if (recipients.length === 0) return;

    await notify({
      orgId,
      recipients,
      taskId: task.id,
      type: "Info",
      title: `New comment on: ${task.title}`,
      message: `${actorName} commented on the task.`,
    });
  } catch (error) {
    console.error("notifyTaskCommented error:", error);
  }
}
