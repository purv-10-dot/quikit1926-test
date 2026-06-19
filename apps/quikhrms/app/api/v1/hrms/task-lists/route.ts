import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, conflict } from "@/lib/api-response";
import { upsertTaskListSchema } from "@/lib/validations/tasks";
import { createAuditLog } from "@/lib/utils/audit";

export const GET = withAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const lists = await prisma.taskList.findMany({
      where: { orgId, deletedAt: null, isArchived: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return successResponse(lists);
  } catch (e) {
    console.error("GET /task-lists error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = upsertTaskListSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const dup = await prisma.taskList.findFirst({ where: { orgId, name: parsed.data.name, deletedAt: null } });
    if (dup) return conflict("Task list with this name already exists");

    const record = await prisma.taskList.create({
      data: { orgId, ...parsed.data, createdBy: userId, updatedBy: userId },
    });
    await createAuditLog({
      orgId, userId, action: "Create", entityType: "TaskList", entityId: record.id,
      changes: parsed.data, request: req,
    });
    return successResponse(record, undefined, 201);
  } catch (e) {
    console.error("POST /task-lists error:", e);
    return internalError();
  }
}, { requiredPermissions: ["hrms.settings.write"] });
