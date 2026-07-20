import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import { readJson } from "@/lib/server/helpers";
import * as notifications from "@/lib/server/notifications.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

/**
 * POST /api/notifications/read-by-channel { channelId } — silence a channel's
 * bell (rows stay in the feed, badge clears). Returns the affected count.
 */
export const POST = withOrgAuth(
  async (req, ctx) => {
    const body = await readJson(req);
    const channelId = body.channelId;
    if (typeof channelId !== "string" || !channelId) {
      throw new HttpError(400, "channelId is required");
    }
    const { affected } = await notifications.markReadByChannel(ctx, channelId);
    const unreadCount = await notifications.unreadCount(ctx);
    return Response.json({ channelId, affected, unreadCount });
  },
  { rateLimit: RATE.notifyRead },
);
