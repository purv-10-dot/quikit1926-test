import { NextResponse } from "next/server";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { toErrorMessage } from "@/lib/api/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const auth = withOrgAuthForResource("clientMeetings.clients", "ClientMaster");

interface CalendarEventView {
  id: string;
  subject: string;
  start: string;
  end: string;
  isOnlineMeeting: boolean;
  joinUrl: string | null;
  organizer: string | null;
  webLink: string | null;
}

interface CalendarViewResponse {
  connected: boolean;
  organizer: string | null;
  events: CalendarEventView[];
}

/**
 * GET /api/client-meetings/calendar?start=<ISO>&end=<ISO>
 *
 * The Client Master calendar icon reads the org's connected Microsoft (Teams)
 * calendar. The OAuth connection + Graph access live in QuikFlow, so this route
 * (org-authed for the user) proxies server-side to QuikFlow's internal
 * calendar-view endpoint with the shared INTERNAL_SECRET. When QuikFlow isn't
 * configured / no calendar is connected, it returns `connected: false` so the UI
 * degrades to "connect a calendar" rather than erroring.
 */
export const GET = auth.view(async ({ orgId }, request) => {
  try {
    const sp = new URL(request.url).searchParams;
    const now = new Date();
    // Default window: start of this month → start of next month.
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const start = sp.get("start") || monthStart.toISOString();
    const end = sp.get("end") || monthEnd.toISOString();

    const quikflowUrl = process.env.QUIKFLOW_URL;
    const secret = process.env.INTERNAL_SECRET;
    if (!quikflowUrl || !secret) {
      const empty: CalendarViewResponse = { connected: false, organizer: null, events: [] };
      return NextResponse.json({ success: true, data: empty });
    }

    const qs = new URLSearchParams({ orgId, start, end });
    const res = await fetch(`${quikflowUrl}/api/internal/calendar/view?${qs.toString()}`, {
      headers: { "x-internal-secret": secret },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as
      | { success?: boolean; data?: CalendarViewResponse; error?: string }
      | null;
    if (!res.ok || !json?.success || !json.data) {
      // QuikFlow reachable but unhappy (or unreachable) → degrade gracefully.
      const empty: CalendarViewResponse = { connected: false, organizer: null, events: [] };
      return NextResponse.json({ success: true, data: empty });
    }
    return NextResponse.json({ success: true, data: json.data });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: toErrorMessage(error, "Failed to load calendar") },
      { status: 500 },
    );
  }
});
