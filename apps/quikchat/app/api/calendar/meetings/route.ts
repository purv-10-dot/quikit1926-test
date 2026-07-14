import { withOrgAuth } from "@/lib/auth-shims";
import * as calendar from "@/lib/server/calendar.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

// GET /api/calendar/meetings?from=ISO&to=ISO — the caller's meetings in range
// (organizer or attendee), org-scoped, for the planner/agenda view.
export const GET = withOrgAuth(
  async (req, ctx) => {
    const url = new URL(req.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    return Response.json(await calendar.listMeetings(ctx, from, to));
  },
  { rateLimit: RATE.freeBusy },
);
