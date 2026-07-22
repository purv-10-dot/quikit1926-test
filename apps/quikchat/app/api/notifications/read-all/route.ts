import { withOrgAuth } from "@/lib/auth-shims";
import * as notifications from "@/lib/server/notifications.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

/** POST /api/notifications/read-all — mark every unread row read. */
export const POST = withOrgAuth(
  async (_req, ctx) => {
    const affected = await notifications.markAllRead(ctx);
    return Response.json({ affected, unreadCount: 0 });
  },
  { rateLimit: RATE.notifyRead },
);
