import { NextResponse } from "next/server";
import { withServiceAuth } from "@/lib/api/withServiceAuth";
import { fetchOccurrenceAttendance, TeamsAttendanceError } from "@/lib/connectors/teams-attendance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/teams/attendance?orgId=&refType=&refId=&kind=&date=
 *
 * Service-authed read of a Teams attendance report for ONE meeting occurrence —
 * who joined and for how long, plus how each person was invited. QuikScale's
 * Meeting Rhythm reports call this with the shared internal secret because the
 * OAuth connection, the calendar link and Graph access all live in QuikFlow.
 * `orgId` is trusted (service-to-service); no user session.
 *
 * ALWAYS 200. A failure is data, not an exception: the caller's report degrades
 * to transcript-based evidence, and the `reason` tells the UI whether this is
 * something a human can fix (`reconnect-required` → reconnect Teams;
 * `access-policy` → a DevOps task) or simply not ready yet (`not-ready` — the
 * report is generated after the meeting ends). Returning 4xx/5xx here would
 * make an ordinary "no report yet" look like a broken integration.
 */
export const GET = withServiceAuth(async (req) => {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("orgId");
  const refId = url.searchParams.get("refId");
  const kind = url.searchParams.get("kind");
  const date = url.searchParams.get("date");
  const refType = url.searchParams.get("refType") ?? "clientMaster";

  if (!orgId || !refId || !kind || !date) {
    return NextResponse.json(
      { success: false, error: "orgId, refId, kind and date are required" },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ success: false, error: "date must be YYYY-MM-DD" }, { status: 400 });
  }

  try {
    const result = await fetchOccurrenceAttendance(orgId, { refType, refId, kind, date });
    return NextResponse.json({ success: true, data: { available: true, ...result } });
  } catch (error: unknown) {
    if (error instanceof TeamsAttendanceError) {
      return NextResponse.json({
        success: true,
        data: { available: false, reason: error.reason, message: error.message },
      });
    }
    const message = error instanceof Error ? error.message : "Attendance lookup failed";
    return NextResponse.json({
      success: true,
      data: { available: false, reason: "graph-error", message },
    });
  }
});
