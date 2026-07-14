import { withOrgAuth } from "@/lib/auth-shims";
import type { UpdateCalendarInput } from "@/lib/shared";
import { readJson } from "@/lib/server/helpers";
import * as calendarEvents from "@/lib/server/calendar-events.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

// PATCH /api/calendar/calendars/[id] — rename / recolor / toggle visibility.
export const PATCH = withOrgAuth(
  async (req, ctx, params) => {
    const body = (await readJson(req)) as unknown as UpdateCalendarInput;
    return Response.json(await calendarEvents.updateCalendar(ctx, params.id!, body));
  },
  { rateLimit: RATE.calendarWrite },
);
