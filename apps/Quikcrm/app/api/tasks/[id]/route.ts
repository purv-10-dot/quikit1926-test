import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { updateTaskSchema } from "@/lib/validators/task";
import { deleteTask, getTask, updateTask } from "@/lib/services/tasks";
import { evaluateRulesForEvent } from "@/lib/notifications/rules/engine";
import {
  notifyTaskAssigned,
  notifyTaskCompleted,
} from "@/lib/notifications/task-triggers";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "tasks", "view");
    const { id } = await ctx.params;
    const task = await getTask(user, id);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    return NextResponse.json(task);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const { id } = await ctx.params;
    const parsed = updateTaskSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid body", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const patch = parsed.data;

    // Capture old assignee BEFORE the update so we can detect a real change.
    // Only incurs the extra DB read when the PATCH includes assignedToUserId.
    let oldAssigneeId: string | null = null;
    if (patch.assignedToUserId !== undefined) {
      const existing = await getTask(user, id);
      oldAssigneeId = existing?.assignedToUserId ?? null;
    }

    // Status=Cancelled requires a cancellation reason. The reason is stored
    // on the resulting CrmActivity audit row (CrmTask has no column for it
    // yet).
    if (patch.status === "Cancelled" && !patch.cancellationReason?.trim()) {
      return NextResponse.json(
        { error: "Cancellation reason is required when status is Cancelled" },
        { status: 400 },
      );
    }

    // Marking complete is permission-gated separately so a user with
    // "tasks.edit" but not "tasks.markComplete" can still rename / reassign
    // but cannot tick the done box.
    if (patch.status === "Completed") {
      await assertModule(user, "tasks", "markComplete");
    } else {
      await assertModule(user, "tasks", "edit");
    }

    const updated = await updateTask(user, id, patch);

    // ── Task Assigned notification ─────────────────────────────────────────
    // Fires when assignedToUserId changes to a new non-null value.
    if (patch.assignedToUserId !== undefined && updated.assignedToUserId) {
      notifyTaskAssigned({
        orgId: user.orgId,
        taskId: id,
        taskSubject: updated.subject,
        newAssigneeId: updated.assignedToUserId,
        oldAssigneeId,
        actorUserId: user.userId,
        actorName: user.name || user.email,
        dueDate: updated.dueDate,
        priority: updated.priority,
      }).catch((e) => console.error("[notifications] task assigned on update", e));
    }

    // ── Task Completed notification ────────────────────────────────────────
    // Fires when a manager/third-party marks someone else's task as completed.
    if (patch.status === "Completed") {
      notifyTaskCompleted({
        orgId: user.orgId,
        taskId: id,
        taskSubject: updated.subject,
        completedByUserId: user.userId,
        completedByName: user.name || user.email,
        assignedToUserId: updated.assignedToUserId,
      }).catch((e) => console.error("[notifications] task completed", e));
    }

    // Determine the most descriptive event name from the patch fields.
    const taskEvent =
      patch.status !== undefined ? "status_changed"
      : patch.assignedToUserId !== undefined ? "assigned"
      : "updated";
    evaluateRulesForEvent({
      event: taskEvent,
      entityType: "task",
      entityId: id,
      orgId: user.orgId,
      actorUserId: user.userId,
      actorName: user.name || user.email,
      after: updated as unknown as Record<string, unknown>,
      changedFields: Object.keys(patch),
    }).catch((e) => console.error("[rules-engine] task updated", e));
    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "tasks", "delete");
    const { id } = await ctx.params;
    // Fetch before delete so the rules engine has entity context.
    const taskBefore = await getTask(user, id).catch(() => null);
    await deleteTask(user, id);
    if (taskBefore) {
      evaluateRulesForEvent({
        event: "deleted",
        entityType: "task",
        entityId: id,
        orgId: user.orgId,
        actorUserId: user.userId,
        actorName: user.name || user.email,
        before: taskBefore as unknown as Record<string, unknown>,
        changedFields: [],
      }).catch((e) => console.error("[rules-engine] task deleted", e));
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
