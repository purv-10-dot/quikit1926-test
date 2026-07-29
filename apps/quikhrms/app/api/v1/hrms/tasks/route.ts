import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { createTaskSchema } from "@/lib/validations/tasks";
import { resolveEmployeeId } from "@/lib/resolve-employee";
import { createAuditLog } from "@/lib/utils/audit";
import { notifyTaskAssigned } from "@/lib/services/task-notifications";

type Scope = "mine" | "managed" | "requested" | "all";

export const GET = withAuth(async (req: NextRequest, { orgId, userId, permissions }) => {
  try {
    const url = new URL(req.url);
    const requested = (url.searchParams.get("scope") ?? "mine") as Scope;
    const status = url.searchParams.get("status");
    const taskListId = url.searchParams.get("taskListId");
    const requestedFor = url.searchParams.get("requestedFor");
    const groupKey = url.searchParams.get("groupKey");
    const dueBefore = url.searchParams.get("dueBefore");
    const dueAfter = url.searchParams.get("dueAfter");

    const employeeId = await resolveEmployeeId(orgId, userId);

    // Org-wide task reads are privileged. Default to self; only honor a wider
    // scope when the caller actually holds the right — otherwise SILENTLY narrow
    // back to "mine". This guarantees we never run an unfiltered { orgId }-only
    // task query for an unauthorized caller.
    const canReadAll = permissions.includes("*") || permissions.includes("hrms.task.read_all");
    let scope: Scope = (["mine", "managed", "requested", "all"] as Scope[]).includes(requested) ? requested : "mine";
    if (scope === "all" && !canReadAll) scope = "mine";
    if (scope !== "all" && !employeeId) return notFound("Employee not found");

    const where: Record<string, unknown> = {
      orgId, deletedAt: null,
      ...(taskListId && { taskListId }),
      ...(groupKey && { groupKey }),
    };

    if (scope === "mine") {
      where.assigneeId = employeeId;
    } else if (scope === "requested") {
      where.requesterId = employeeId;
    } else if (scope === "managed") {
      // Manager scope = direct reports' tasks (already limited to the caller's
      // own reports). A caller with no reports and no read-all right is silently
      // narrowed to their own tasks.
      const reports = await prisma.employee.findMany({
        where: { orgId, deletedAt: null, reportingManagerId: employeeId! },
        select: { id: true },
      });
      if (!canReadAll && reports.length === 0) where.assigneeId = employeeId;
      else where.assigneeId = { in: reports.map((r) => r.id) };
    }
    // scope === "all": canReadAll is guaranteed true here — org-wide read allowed.

    // requestedFor is only honored alongside an authorized wider scope, so it can
    // never be used to peek at another person's tasks from a self-scoped view.
    if (requestedFor && (scope === "all" || scope === "managed")) where.requestedFor = requestedFor;

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

    // Validate references belong to this org before writing.
    const assignee = await prisma.employee.findFirst({ where: { id: parsed.data.assigneeId, orgId, deletedAt: null }, select: { id: true } });
    if (!assignee) return notFound("Assignee not found");
    if (parsed.data.requestedFor) {
      const emp = await prisma.employee.findFirst({ where: { id: parsed.data.requestedFor, orgId, deletedAt: null }, select: { id: true } });
      if (!emp) return notFound("Requested-for employee not found");
    }
    if (parsed.data.taskListId) {
      const tl = await prisma.taskList.findFirst({ where: { id: parsed.data.taskListId, orgId, deletedAt: null }, select: { id: true } });
      if (!tl) return notFound("Task list not found");
    }

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
