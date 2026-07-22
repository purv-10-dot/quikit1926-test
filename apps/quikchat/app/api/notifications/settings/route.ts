import { withOrgAuth } from "@/lib/auth-shims";
import type { NotificationLevel } from "@/lib/shared";
import { readJson } from "@/lib/server/helpers";
import * as notifications from "@/lib/server/notifications.service";
import type { SettingsPatch } from "@/lib/server/notifications.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

const LEVELS: NotificationLevel[] = ["all", "mentions", "none"];
const isLevel = (v: unknown): v is NotificationLevel =>
  typeof v === "string" && (LEVELS as string[]).includes(v);
const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isTime = (v: unknown): v is string | null =>
  v === null || (typeof v === "string" && /^\d{2}:\d{2}$/.test(v));

export const GET = withOrgAuth(async (_req, ctx) => {
  return Response.json(await notifications.getSettings(ctx));
});

/** PATCH /api/notifications/settings — patch only the allowed fields. */
export const PATCH = withOrgAuth(
  async (req, ctx) => {
    const body = await readJson(req);
    const patch: SettingsPatch = {};
    if (isLevel(body.defaultChannelLevel)) patch.defaultChannelLevel = body.defaultChannelLevel;
    if (isLevel(body.dmsLevel)) patch.dmsLevel = body.dmsLevel;
    if (isBool(body.soundEnabled)) patch.soundEnabled = body.soundEnabled;
    if (isBool(body.desktopEnabled)) patch.desktopEnabled = body.desktopEnabled;
    if (isBool(body.emailEnabled)) patch.emailEnabled = body.emailEnabled;
    if (isBool(body.dndEnabled)) patch.dndEnabled = body.dndEnabled;
    if (isTime(body.dndStart)) patch.dndStart = body.dndStart;
    if (isTime(body.dndEnd)) patch.dndEnd = body.dndEnd;
    if (isBool(body.priorityDuringDnd)) patch.priorityDuringDnd = body.priorityDuringDnd;
    if (body.snoozedUntil !== undefined) {
      patch.snoozedUntil =
        typeof body.snoozedUntil === "string" ? new Date(body.snoozedUntil) : null;
    }
    return Response.json(await notifications.updateSettings(ctx, patch));
  },
  { rateLimit: RATE.notifyWrite },
);
