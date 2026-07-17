import { withOrgAuth } from "@/lib/auth-shims";
import * as notifications from "@/lib/server/notifications.service";

export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async (_req, ctx) => {
  return Response.json({ count: await notifications.unreadCount(ctx) });
});
