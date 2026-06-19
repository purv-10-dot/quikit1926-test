import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError, notFound } from "@/lib/api-response";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { createAuditLog } from "@/lib/utils/audit";
import { notifyTaskCompleted } from "@/lib/services/task-notifications";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const task = await prisma.task.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!task) return notFound();

    const isCompleting = task.status !== "Completed";
    const newStatus = isCompleting ? "Completed" : "Open";
    const updated = await prisma.task.update({
      where: { id },
      data: {
        status: newStatus,
        completedAt: isCompleting ? new Date() : null,
        completedBy: isCompleting ? userId : null,
        updatedBy: userId,
      },
    });

    const authorId = (await resolveEmployeeId(orgId, userId)) ?? userId;
    await prisma.taskActivity.create({
      data: {
        orgId, taskId: id, authorId,
        type: isCompleting ? "completed" : "status",
        content: isCompleting ? "Task completed" : "Task reopened",
      },
    });
    await createAuditLog({
      orgId, userId, action: "StatusChange", entityType: "Task", entityId: id,
      changes: { from: task.status, to: newStatus }, request: req,
    });
    if (isCompleting) {
      void notifyTaskCompleted(orgId, {
        id: updated.id,
        title: updated.title,
        assigneeId: updated.assigneeId,
        requesterId: updated.requesterId,
      }, authorId);
    }
    return successResponse(updated);
  } catch (e) {
    console.error("POST /tasks/[id]/complete error:", e);
    return internalError();
  }
});
