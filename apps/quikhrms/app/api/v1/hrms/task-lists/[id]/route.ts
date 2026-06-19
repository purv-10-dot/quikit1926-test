import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { upsertTaskListSchema } from "@/lib/validations/tasks";
import { createAuditLog } from "@/lib/utils/audit";

export const PUT = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const existing = await prisma.taskList.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound();
    const body = await req.json();
    const parsed = upsertTaskListSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    const updated = await prisma.taskList.update({ where: { id }, data: { ...parsed.data, updatedBy: userId } });
    await createAuditLog({
      orgId, userId, action: "Update", entityType: "TaskList", entityId: id,
      changes: parsed.data, request: req,
    });
    return successResponse(updated);
  } catch (e) {
    console.error("PUT /task-lists/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });

export const DELETE = withAuth(async (req: NextRequest, { orgId, userId }, { id }) => {
  try {
    const existing = await prisma.taskList.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!existing) return notFound();
    const inUse = await prisma.task.count({ where: { orgId, taskListId: id, deletedAt: null } });
    if (inUse > 0) {
      await prisma.taskList.update({ where: { id }, data: { isArchived: true, updatedBy: userId } });
    } else {
      await prisma.taskList.update({ where: { id }, data: { deletedAt: new Date(), updatedBy: userId } });
    }
    await createAuditLog({ orgId, userId, action: "Delete", entityType: "TaskList", entityId: id, request: req });
    return successResponse({ id, archived: inUse > 0 });
  } catch (e) {
    console.error("DELETE /task-lists/[id] error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
