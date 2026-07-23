import { withOrgAuth } from "@/lib/auth-shims";
import { readJson } from "@/lib/server/helpers";
import * as notifications from "@/lib/server/notifications.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

/** POST /api/notifications/read { ids } — mark specific rows read. */
export const POST = withOrgAuth(
  async (req, ctx) => {
    const body = await readJson(req);
    const ids = Array.isArray(body.ids)
      ? (body.ids as unknown[]).filter((x) => typeof x === "string")
      : [];
    const affected = await notifications.markRead(ctx, ids as string[]);
    const unreadCount = await notifications.unreadCount(ctx);
    return Response.json({ affected, unreadCount });
  },
  { rateLimit: RATE.notifyRead },
);
