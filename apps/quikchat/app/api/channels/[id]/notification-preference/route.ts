import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import type { NotificationLevel } from "@/lib/shared";
import { readJson } from "@/lib/server/helpers";
import * as notifications from "@/lib/server/notifications.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

const LEVELS: NotificationLevel[] = ["all", "mentions", "none"];

export const GET = withOrgAuth(async (_req, ctx, params) => {
  return Response.json(await notifications.getChannelPreferenceDto(ctx, params.id!));
});

/** PATCH /api/channels/[id]/notification-preference { level?, mutedUntil? }. */
export const PATCH = withOrgAuth(
  async (req, ctx, params) => {
    const body = await readJson(req);
    const patch: { level?: NotificationLevel; mutedUntil?: Date | null } = {};
    if (body.level !== undefined) {
      if (typeof body.level !== "string" || !(LEVELS as string[]).includes(body.level)) {
        throw new HttpError(400, "level must be one of all|mentions|none");
      }
      patch.level = body.level as NotificationLevel;
    }
    if (body.mutedUntil !== undefined) {
      patch.mutedUntil = typeof body.mutedUntil === "string" ? new Date(body.mutedUntil) : null;
    }
    return Response.json(await notifications.setChannelPreference(ctx, params.id!, patch));
  },
  { rateLimit: RATE.notifyWrite },
);
