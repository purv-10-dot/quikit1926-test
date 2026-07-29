import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, forbidden, internalError, notFound } from "@/lib/api-response";
import { updateTaskSchema } from "@/lib/validations/tasks";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { canActOnTask } from "@/lib/rbac/task-access";
import { createAuditLog } from "@/lib/utils/audit";
import { notifyTaskReassigned, notifyTaskCompleted } from "@/lib/services/task-notifications";

export const GET = withAuth(async (_req: NextRequest, ctx, { id }) => {
  try {
    const { orgId } = ctx;
    const task = await prisma.task.findFirst({
      where: { id, orgId, deletedAt: null },
      include: {
        taskList: { select: { id: true, name: true, color: true } },
        activity: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!task) return notFound();
    if (!(await canActOnTask(ctx, task))) return forbidden("You don't have access to this task");

    const empIds = [
      ...new Set([
        task.assigneeId, task.requesterId, task.requestedFor,
        ...task.activity.map((a) => a.authorId),
      ].filter(Boolean) as string[]),
    ];
    const employees = await prisma.employee.findMany({
      where: { orgId, id: { in: empIds }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, profilePhoto: true, jobTitle: true },
    });
    const empMap = new Map(employees.map((e) => [e.id, e]));

    return successResponse({
      ...task,
      assignee: empMap.get(task.assigneeId) ?? null,
      requester: task.requesterId ? empMap.get(task.requesterId) ?? null : null,
      requestedForEmployee: task.requestedFor ? empMap.get(task.requestedFor) ?? null : null,
      activity: task.activity.map((a) => ({ ...a, author: empMap.get(a.authorId) ?? null })),
    });
  } catch (e) {
    console.error("GET /tasks/[id] error:", e);
    return internalError();
  }
});

export const PATCH = withAuth(async (req: NextRequest, ctx, { id }) => {
  try {
    const { orgId, userId } = ctx;
    const existing = await prisma.task.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound();
    if (!(await canActOnTask(ctx, existing))) return forbidden("You don't have access to this task");

    const body = await req.json();
    const parsed = updateTaskSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    // Validate references belong to this org before writing.
    if (parsed.data.assigneeId) {
      const emp = await prisma.employee.findFirst({ where: { id: parsed.data.assigneeId, orgId, deletedAt: null }, select: { id: true } });
      if (!emp) return notFound("Assignee not found");
    }
    if (parsed.data.requestedFor) {
      const emp = await prisma.employee.findFirst({ where: { id: parsed.data.requestedFor, orgId, deletedAt: null }, select: { id: true } });
      if (!emp) return notFound("Requested-for employee not found");
    }
    if (parsed.data.taskListId) {
      const tl = await prisma.taskList.findFirst({ where: { id: parsed.data.taskListId, orgId, deletedAt: null }, select: { id: true } });
      if (!tl) return notFound("Task list not found");
    }

    const data: Record<string, unknown> = { ...parsed.data, updatedBy: userId };
    if (parsed.data.dueDate !== undefined) {
      data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
    }
    if (parsed.data.status === "Completed") {
      data.completedAt = new Date();
      data.completedBy = userId;
    } else if (parsed.data.status !== undefined) {
      // Reopening / cancelling clears completion metadata (mirrors the complete route).
      data.completedAt = null;
      data.completedBy = null;
    }

    const updated = await prisma.task.update({ where: { id }, data });

    const authorId = (await resolveEmployeeId(orgId, userId)) ?? userId;
    if (parsed.data.status && parsed.data.status !== existing.status) {
      await prisma.taskActivity.create({
        data: { orgId, taskId: id, authorId, type: "status",
          content: `Status changed: ${existing.status} → ${parsed.data.status}` },
      });
    }
    if (parsed.data.assigneeId && parsed.data.assigneeId !== existing.assigneeId) {
      await prisma.taskActivity.create({
        data: { orgId, taskId: id, authorId, type: "assigned",
          content: `Reassigned to ${parsed.data.assigneeId}` },
      });
    }
    if (parsed.data.dueDate !== undefined && parsed.data.dueDate) {
      await prisma.taskActivity.create({
        data: { orgId, taskId: id, authorId, type: "due_date",
          content: `Due date set to ${new Date(parsed.data.dueDate).toLocaleDateString("en-IN")}` },
      });
    }

    await createAuditLog({
      orgId, userId, action: "Update", entityType: "Task", entityId: id,
      before: existing as unknown as Record<string, unknown>,
      after: updated as unknown as Record<string, unknown>,
      request: req,
    });

    const taskLite = {
      id: updated.id,
      title: updated.title,
      assigneeId: updated.assigneeId,
      requesterId: updated.requesterId,
    };
    if (parsed.data.assigneeId && parsed.data.assigneeId !== existing.assigneeId) {
      void notifyTaskReassigned(orgId, taskLite, existing.assigneeId, authorId);
    }
    if (parsed.data.status === "Completed" && existing.status !== "Completed") {
      void notifyTaskCompleted(orgId, taskLite, authorId);
    }

    return successResponse(updated);
  } catch (e) {
    console.error("PATCH /tasks/[id] error:", e);
    return internalError();
  }
});

export const DELETE = withAuth(async (req: NextRequest, ctx, { id }) => {
  try {
    const { orgId, userId } = ctx;
    const existing = await prisma.task.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound();
    if (!(await canActOnTask(ctx, existing))) return forbidden("You don't have access to this task");
    await prisma.task.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: userId } });
    await createAuditLog({ orgId, userId, action: "Delete", entityType: "Task", entityId: id, request: req });
    return successResponse({ id, deleted: true });
  } catch (e) {
    console.error("DELETE /tasks/[id] error:", e);
    return internalError();
  }
});
