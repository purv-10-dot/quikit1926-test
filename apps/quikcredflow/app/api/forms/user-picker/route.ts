import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { listUsersForPicker } from "@/lib/services/forms/user-picker.service";

export const runtime = "nodejs";

const querySchema = z.object({
  scope: z.enum(["all_users", "team", "role"]),
  role: z.string().trim().min(1).optional(),
});

/**
 * GET /api/forms/user-picker?scope=all_users|team|role[&role=...]
 *
 * The RBAC-scoped list of users the CALLING agent may pick for a user_picker
 * field. No assertModule gate: agents fill these at runtime, not just admins.
 * The result is always clamped to the caller's own scope inside the service,
 * so there is no IDOR — a caller cannot widen the list past what they may see.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const parsed = querySchema.safeParse({
      scope: req.nextUrl.searchParams.get("scope"),
      role: req.nextUrl.searchParams.get("role") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          fieldErrors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const data = await listUsersForPicker(user, {
      scope: parsed.data.scope,
      role: parsed.data.role ?? null,
    });
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return errorResponse(e);
  }
}
