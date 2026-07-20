import { withOrgAuth } from "@/lib/auth-shims";
import * as notifications from "@/lib/server/notifications.service";

export const dynamic = "force-dynamic";

/** GET /api/notifications/unread-by-channel → { byChannel, total }. */
export const GET = withOrgAuth(async (_req, ctx) => {
  const byChannel = await notifications.unreadByChannel(ctx);
  const total = await notifications.unreadCount(ctx);
  return Response.json({ byChannel, total });
});
