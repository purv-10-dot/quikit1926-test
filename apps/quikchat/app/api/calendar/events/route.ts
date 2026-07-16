import { withOrgAuth } from "@/lib/auth-shims";
import type { CreateCalendarEventInput } from "@/lib/shared";
import { readJson } from "@/lib/server/helpers";
import * as calendarEvents from "@/lib/server/calendar-events.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

// GET /api/calendar/events?from=ISO&to=ISO — the caller's events + meeting overlay.
export const GET = withOrgAuth(
  async (req, ctx) => {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    return Response.json(await calendarEvents.listEvents(ctx, from, to));
  },
  { rateLimit: RATE.calendarRead, moduleKey: "calendar" },
);

// POST /api/calendar/events — create a personal event.
export const POST = withOrgAuth(
  async (req, ctx) => {
    const body = (await readJson(req)) as unknown as CreateCalendarEventInput;
    return Response.json(await calendarEvents.createEvent(ctx, body));
  },
  { rateLimit: RATE.calendarWrite, moduleKey: "calendar" },
);
