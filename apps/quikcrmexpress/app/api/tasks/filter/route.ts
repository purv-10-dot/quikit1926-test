import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { advancedFilterSchema } from "@/lib/validators/task";
import { advancedFilter } from "@/lib/services/tasks";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "tasks", "view");
    const parsed = advancedFilterSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid body", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const result = await advancedFilter(user, parsed.data);
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return errorResponse(e);
  }
}
