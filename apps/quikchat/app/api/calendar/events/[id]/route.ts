import { withOrgAuth } from "@/lib/auth-shims";
import type { UpdateCalendarEventInput } from "@/lib/shared";
import { readJson } from "@/lib/server/helpers";
import * as calendarEvents from "@/lib/server/calendar-events.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

// PATCH /api/calendar/events/[id] — edit a personal event the caller owns.
export const PATCH = withOrgAuth(
  async (req, ctx, params) => {
    const body = (await readJson(req)) as unknown as UpdateCalendarEventInput;
    return Response.json(await calendarEvents.updateEvent(ctx, params.id!, body));
  },
  { rateLimit: RATE.calendarWrite, moduleKey: "calendar" },
);

// DELETE /api/calendar/events/[id] — hard-delete a personal event the caller owns.
export const DELETE = withOrgAuth(
  async (_req, ctx, params) => {
    return Response.json(await calendarEvents.deleteEvent(ctx, params.id!));
  },
  { rateLimit: RATE.calendarWrite, moduleKey: "calendar" },
);
