import { withOrgAuth } from "@/lib/auth-shims";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/company — the accent-color source for `<ThemeApplier />`.
 * Returns the caller's platform accent + theme mode (User.accentColor /
 * themeMode), so QuikChat's `accent-*` Tailwind classes are themed from the
 * same place as every other QuikIT app. Standard `{ success, data }` shape.
 */
export const GET = withOrgAuth(async (_req, ctx) => {
  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { accentColor: true, themeMode: true },
  });
  if (!user) {
    return Response.json({ success: false, error: "User not found" }, { status: 404 });
  }
  return Response.json({ success: true, data: user });
});
