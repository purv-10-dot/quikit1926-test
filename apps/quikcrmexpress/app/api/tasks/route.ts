import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { createTaskSchema, listTasksQuerySchema } from "@/lib/validators/task";
import { buildTaskListWhere, createTask, listTasks } from "@/lib/services/tasks";
import {
  createPrismaCursorIterator,
  type PrismaListDelegate,
} from "@/lib/services/reports/prisma-cursor";
import {
  TASK_CSV_SELECT,
  taskCsvColumns,
  readTzFromCookieHeader,
  type TaskCsvRow,
} from "@/lib/services/reports/csv-columns";
import {
  dispatchExport,
  parseReportFormat,
} from "@/lib/services/reports/format-dispatch";
import { evaluateRulesForEvent } from "@/lib/notifications/rules/engine";
import { notifyTaskAssigned } from "@/lib/notifications/task-triggers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "tasks", "view");

    const { searchParams } = new URL(req.url);
    const parsed = listTasksQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid query", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const format = parseReportFormat(searchParams);
    if (format) {
      const tz = readTzFromCookieHeader(req.headers.get("cookie"));
      const where = buildTaskListWhere(user, parsed.data);
      const cursor = createPrismaCursorIterator<TaskCsvRow>({
        delegate: prisma.qceTask as unknown as PrismaListDelegate<TaskCsvRow>,
        where,
        select: TASK_CSV_SELECT,
      });
      return dispatchExport({
        format,
        user,
        cookieHeader: req.headers.get("cookie"),
        rows: cursor,
        columns: taskCsvColumns(tz),
        filenameStem: "tasks",
      });
    }

    const result = await listTasks(user, parsed.data);
    // Keep the legacy `items` key for callers like LeadTasksTab; add the
    // pagination metadata required by the new TasksExplorer view.
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "tasks", "create");
    const parsed = createTaskSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid body", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    // Mark-complete on create is treated as a normal create — auditing for
    // the mid-life Open → Completed transition lives on PATCH.
    const task = await createTask(user, parsed.data);

    // Task assigned notification — fires when created with an assignee.
    if (task.assignedToUserId) {
      notifyTaskAssigned({
        orgId: user.orgId,
        taskId: task.id,
        taskSubject: task.subject,
        newAssigneeId: task.assignedToUserId,
        oldAssigneeId: null,            // New task — no previous assignee.
        actorUserId: user.userId,
        actorName: user.name || user.email,
        dueDate: task.dueDate,
        priority: task.priority,
      }).catch((e) => console.error("[notifications] task assigned on create", e));
    }

    // Rules engine — task created event (non-blocking, after existing logic).
    evaluateRulesForEvent({
      event: "created",
      entityType: "task",
      entityId: task.id,
      orgId: user.orgId,
      actorUserId: user.userId,
      actorName: user.name || user.email,
      after: task as unknown as Record<string, unknown>,
      changedFields: [],
    }).catch((e) => console.error("[rules-engine] task created", e));

    return NextResponse.json(task, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
