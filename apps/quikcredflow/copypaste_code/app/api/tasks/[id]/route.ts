import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { updateTaskSchema } from "@/lib/validators/task";
import { deleteTask, getTask, updateTask } from "@/lib/services/tasks";

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
    await deleteTask(user, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
