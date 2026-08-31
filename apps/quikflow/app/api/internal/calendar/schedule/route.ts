import { NextResponse } from "next/server";
import { withServiceAuth } from "@/lib/api/withServiceAuth";
import { scheduleClientMeetingsForOrg, type ClientMeetingSpec, type ClientMeetingWindow } from "@/lib/connectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Parse a meeting window from the request body. `weekly` maps `day`→`days:[day]`. */
function parseWindow(raw: unknown, weekly = false): ClientMeetingWindow | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const w = raw as Record<string, unknown>;
  const start = typeof w.start === "string" ? w.start : "";
  const end = typeof w.end === "string" ? w.end : "";
  const startDate = typeof w.startDate === "string" ? w.startDate : "";
  if (!start || !end || !startDate) return undefined;
  const days = weekly
    ? typeof w.day === "string" && w.day
      ? [w.day]
      : Array.isArray(w.days)
        ? (w.days as unknown[]).filter((d): d is string => typeof d === "string")
        : []
    : Array.isArray(w.days)
      ? (w.days as unknown[]).filter((d): d is string => typeof d === "string")
      : [];
  return { start, end, days, startDate, until: typeof w.until === "string" && w.until ? w.until : null };
}

/**
 * POST /api/internal/calendar/schedule — service-authed. Creates (or idempotently
 * updates) BOTH the Daily Huddle and Weekly Meeting for a Client Master record on
 * the org's connected Microsoft calendar. Called by QuikScale's "Create Teams
 * meetings" button — the direct path that needs no QuikFlow workflow.
 */
export const POST = withServiceAuth(async (req) => {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const orgId = typeof body?.orgId === "string" ? body.orgId : "";
  const refId = typeof body?.refId === "string" ? body.refId : "";
  if (!orgId || !refId) {
    return NextResponse.json({ success: false, error: "orgId and refId are required" }, { status: 400 });
  }

  const spec: ClientMeetingSpec = {
    refType: typeof body?.refType === "string" ? body.refType : "clientMaster",
    refId,
    name: typeof body?.name === "string" && body.name ? body.name : "Client",
    timeZone:
      typeof body?.timezone === "string" && body.timezone
        ? body.timezone
        : process.env.QUIKFLOW_DEFAULT_TIMEZONE ?? "UTC",
    attendees: Array.isArray(body?.attendees)
      ? (body!.attendees as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    optionalAttendees: Array.isArray(body?.optionalAttendees)
      ? (body!.optionalAttendees as unknown[]).filter((x): x is string => typeof x === "string")
      : [],
    createdBy: typeof body?.createdBy === "string" ? body.createdBy : "system",
    daily: parseWindow(body?.daily),
    weekly: parseWindow(body?.weekly, true),
  };

  const result = await scheduleClientMeetingsForOrg(orgId, spec);
  return NextResponse.json({ success: true, data: result });
});
