import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { createTaskSchema } from "@/lib/validations/tasks";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { createAuditLog } from "@/lib/utils/audit";
import { notifyTaskAssigned } from "@/lib/services/task-notifications";

type Scope = "mine" | "managed" | "requested" | "all";

export const GET = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const url = new URL(req.url);
    const scope = (url.searchParams.get("scope") ?? "mine") as Scope;
    const status = url.searchParams.get("status");
    const taskListId = url.searchParams.get("taskListId");
    const requestedFor = url.searchParams.get("requestedFor");
    const groupKey = url.searchParams.get("groupKey");
    const dueBefore = url.searchParams.get("dueBefore");
    const dueAfter = url.searchParams.get("dueAfter");

    const employeeId = await resolveEmployeeId(orgId, userId);
    if (!employeeId && scope !== "all") return notFound("Employee not found");

    const where: Record<string, unknown> = {
      orgId, deletedAt: null,
      ...(taskListId && { taskListId }),
      ...(requestedFor && { requestedFor }),
      ...(groupKey && { groupKey }),
    };

    if (scope === "mine" && employeeId) where.assigneeId = employeeId;
    if (scope === "requested" && employeeId) where.requesterId = employeeId;
    if (scope === "managed" && employeeId) {
      // Tasks for direct reports
      const reports = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, reportingManagerId: employeeId },
        select: { id: true },
      });
      where.assigneeId = { in: reports.map((r) => r.id) };
    }

    if (status) {
      const list = status.split(",").filter(Boolean);
      where.status = list.length === 1 ? list[0] : { in: list };
    }
    if (dueBefore || dueAfter) {
      const dueClause: Record<string, Date> = {};
      if (dueBefore) dueClause.lte = new Date(dueBefore);
      if (dueAfter) dueClause.gte = new Date(dueAfter);
      where.dueDate = dueClause;
    }

    const tasks = await prisma.task.findMany({
      where,
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      include: {
        taskList: { select: { id: true, name: true, color: true } },
      },
    });

    const employeeIds = [...new Set(tasks.flatMap((t) => [t.assigneeId, t.requesterId, t.requestedFor].filter(Boolean) as string[]))];
    const employees = employeeIds.length
      ? await prisma.employee.findMany({
          where: { orgId, id: { in: employeeIds }, deletedAt: null },
          select: { id: true, firstName: true, lastName: true, profilePhoto: true, jobTitle: true },
        })
      : [];
    const empMap = new Map(employees.map((e) => [e.id, e]));

    const rows = tasks.map((t) => ({
      ...t,
      assignee: empMap.get(t.assigneeId) ?? null,
      requester: t.requesterId ? empMap.get(t.requesterId) ?? null : null,
      requestedForEmployee: t.requestedFor ? empMap.get(t.requestedFor) ?? null : null,
    }));

    return successResponse(rows);
  } catch (e) {
    console.error("GET /tasks error:", e);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createTaskSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const requesterId = await resolveEmployeeId(orgId, userId);

    const task = await prisma.task.create({
      data: {
        orgId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        taskListId: parsed.data.taskListId ?? null,
        assigneeId: parsed.data.assigneeId,
        requesterId: requesterId,
        requestedFor: parsed.data.requestedFor ?? null,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        priority: parsed.data.priority,
        groupKey: parsed.data.groupKey ?? null,
        status: "Open",
        createdBy: userId,
        updatedBy: userId,
      },
    });
    await prisma.taskActivity.create({
      data: { orgId, taskId: task.id, authorId: requesterId ?? userId, type: "created", content: `Created task: ${task.title}` },
    });
    await createAuditLog({
      orgId, userId, action: "Create", entityType: "Task", entityId: task.id,
      changes: parsed.data, request: req,
    });
    void notifyTaskAssigned(orgId, {
      id: task.id,
      title: task.title,
      assigneeId: task.assigneeId,
      requesterId: task.requesterId,
    }, requesterId ?? userId);
    return successResponse(task, undefined, 201);
  } catch (e) {
    console.error("POST /tasks error:", e);
    return internalError();
  }
});
