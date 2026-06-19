import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { addTaskCommentSchema } from "@/lib/validations/tasks";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { notifyTaskCommented } from "@/lib/services/task-notifications";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const task = await prisma.task.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!task) return notFound();

    const body = await req.json();
    const parsed = addTaskCommentSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const authorId = (await resolveEmployeeId(orgId, userId)) ?? userId;
    const activity = await prisma.taskActivity.create({
      data: { orgId, taskId: id, authorId, type: "comment", content: parsed.data.content },
    });
    void notifyTaskCommented(orgId, {
      id: task.id,
      title: task.title,
      assigneeId: task.assigneeId,
      requesterId: task.requesterId,
    }, authorId);
    return successResponse(activity, undefined, 201);
  } catch (e) {
    console.error("POST /tasks/[id]/comments error:", e);
    return internalError();
  }
});
