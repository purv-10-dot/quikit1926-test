import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { snoozeSchema } from "@/lib/validators/task";
import { snoozeTask } from "@/lib/services/tasks";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "tasks", "edit");
    const { id } = await ctx.params;
    const parsed = snoozeSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid body", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const newDueDate = parsed.data.until
      ? new Date(parsed.data.until)
      : new Date(Date.now() + (parsed.data.minutes ?? 0) * 60 * 1000);

    const result = await snoozeTask(user, id, newDueDate);
    return NextResponse.json(result.task);
  } catch (e) {
    return errorResponse(e);
  }
}
