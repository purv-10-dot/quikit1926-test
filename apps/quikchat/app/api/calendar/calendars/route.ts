import { withOrgAuth } from "@/lib/auth-shims";
import * as calendarEvents from "@/lib/server/calendar-events.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

// GET /api/calendar/calendars — the caller's "My calendars" list (owner-scoped).
export const GET = withOrgAuth(
  async (_req, ctx) => {
    return Response.json(await calendarEvents.listCalendars(ctx));
  },
  { rateLimit: RATE.calendarRead, moduleKey: "calendar" },
);
