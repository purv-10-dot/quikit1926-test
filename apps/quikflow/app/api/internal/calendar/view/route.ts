import { NextResponse } from "next/server";
import { withServiceAuth } from "@/lib/api/withServiceAuth";
import { listCalendarForOrg } from "@/lib/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/calendar/view?orgId=&start=&end= — service-authed read of an
 * org's connected Microsoft (Teams) calendar over [start, end). Source apps
 * (QuikScale's Client Master calendar) call this with the shared internal secret
 * because the OAuth connection + Graph access live in QuikFlow, not the caller.
 * `orgId` is trusted (service-to-service); no user session.
 */
export const GET = withServiceAuth(async (req) => {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("orgId");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!orgId || !start || !end) {
    return NextResponse.json(
      { success: false, error: "orgId, start and end are required" },
      { status: 400 },
    );
  }

  const result = await listCalendarForOrg(orgId, start, end);
  if (!result) {
    // No connected calendar → not an error; the caller renders the normal view.
    return NextResponse.json({ success: true, data: { connected: false, organizer: null, events: [] } });
  }
  return NextResponse.json({
    success: true,
    data: { connected: true, organizer: result.organizer, events: result.events },
  });
});
