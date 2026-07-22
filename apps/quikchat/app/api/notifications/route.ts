import { withOrgAuth } from "@/lib/auth-shims";
import * as notifications from "@/lib/server/notifications.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

/** GET /api/notifications?limit&before&unreadOnly — paginated activity feed. */
export const GET = withOrgAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;
  const before = url.searchParams.get("before") ?? undefined;
  const unreadParam = url.searchParams.get("unreadOnly");
  const unreadOnly = unreadParam === "1" || unreadParam === "true";
  const items = await notifications.list(ctx, {
    limit: limit && Number.isFinite(limit) ? limit : undefined,
    before,
    unreadOnly,
  });
  const unreadCount = await notifications.unreadCount(ctx);
  return Response.json({ items, unreadCount });
});

/** DELETE /api/notifications — clear the entire feed for the caller. */
export const DELETE = withOrgAuth(
  async (_req, ctx) => {
    await notifications.clearAll(ctx);
    return Response.json({ unreadCount: 0 });
  },
  { rateLimit: RATE.notifyRead },
);
