import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { parseDocxTranscript, DocxTranscriptError, DOCX_MIME, MAX_DOCX_BYTES } from "@/lib/services/docxTranscript";

export const runtime = "nodejs";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dashboard");

/** "HH:mm" — the optional actual start/end the uploader may supply. */
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * POST /api/client-meetings/transcripts/upload — manually add a meeting
 * transcript from a `.docx` file (multipart form: file, clientId, type,
 * meetingDate, title?, attendeeIds?, startTime?, endTime?) when no Fathom
 * recording exists for a meeting. The resulting row is a normal
 * `ClientMeetingTranscript` (`source: "manual"`) so the existing viewer,
 * export, and Gemini report-generation routes work on it unchanged.
 *
 * WHY `attendeeIds` MATTERS
 * ------------------------
 * A `.docx` carries no participant list, so without this the attendance ladder
 * has nothing but "who spoke" — and silence is not evidence of absence, so
 * every quiet attendee lands on UNKNOWN and no absentee is ever named. A human
 * ticking who attended is the strongest signal there is: it is authoritative in
 * BOTH directions (`attendeesSource: "manual"`), so anyone on the roster and
 * not on the list reads ABSENT. That is what puts absentees back in the report.
 *
 * It stays OPTIONAL. Omitting it reproduces the old behaviour exactly — the
 * list is then empty, `attendeesSource` is null, and the ladder falls back to
 * transcript evidence — so an integration that only posts a file still works.
 */
export const POST = withOrgAuth(async ({ orgId, userId }, request) => {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ success: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  const clientId = form.get("clientId");
  const type = form.get("type");
  const meetingDate = form.get("meetingDate");
  const titleInput = form.get("title");
  const attendeeIdsInput = form.get("attendeeIds");
  const startTimeInput = form.get("startTime");
  const endTimeInput = form.get("endTime");

  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: "Missing file" }, { status: 400 });
  }
  if (file.type && file.type !== DOCX_MIME && !file.name?.toLowerCase().endsWith(".docx")) {
    return NextResponse.json({ success: false, error: "Only .docx files are supported" }, { status: 400 });
  }
  if (file.size > MAX_DOCX_BYTES) {
    return NextResponse.json({ success: false, error: "File is too large (10 MB max)" }, { status: 400 });
  }
  if (typeof clientId !== "string" || !clientId) {
    return NextResponse.json({ success: false, error: "Missing clientId" }, { status: 400 });
  }
  if (type !== "DAILY" && type !== "WEEKLY") {
    return NextResponse.json({ success: false, error: "type must be DAILY or WEEKLY" }, { status: 400 });
  }
  if (typeof meetingDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(meetingDate)) {
    return NextResponse.json({ success: false, error: "meetingDate must be YYYY-MM-DD" }, { status: 400 });
  }

  let attendeeIds: string[] = [];
  if (typeof attendeeIdsInput === "string" && attendeeIdsInput.trim()) {
    try {
      const parsed: unknown = JSON.parse(attendeeIdsInput);
      if (!Array.isArray(parsed) || parsed.some((v) => typeof v !== "string")) throw new Error();
      attendeeIds = [...new Set(parsed as string[])];
    } catch {
      return NextResponse.json(
        { success: false, error: "attendeeIds must be a JSON array of member ids" },
        { status: 400 },
      );
    }
  }
  for (const [label, value] of [["startTime", startTimeInput], ["endTime", endTimeInput]] as const) {
    if (value !== null && value !== "" && !(typeof value === "string" && HHMM.test(value))) {
      return NextResponse.json({ success: false, error: `${label} must be HH:mm` }, { status: 400 });
    }
  }

  const client = await db.client.findFirst({ where: { id: clientId, orgId }, select: { name: true } });
  if (!client) {
    return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  }

  // Resolve against THIS org's members only, so a stray id from another tenant
  // cannot be written into the attendee list.
  const attendeeMembers = attendeeIds.length
    ? await db.clientMember.findMany({
        where: { id: { in: attendeeIds }, orgId, deletedAt: null },
        select: { id: true, name: true, email: true },
      })
    : [];
  if (attendeeMembers.length !== attendeeIds.length) {
    return NextResponse.json(
      { success: false, error: "One or more attendees are invalid" },
      { status: 400 },
    );
  }

  let rawText: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    rawText = await parseDocxTranscript(buffer);
  } catch (err) {
    if (err instanceof DocxTranscriptError) {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Could not read this .docx file" }, { status: 400 });
  }

  const title = (typeof titleInput === "string" && titleInput.trim()) || file.name.replace(/\.docx$/i, "");

  // Times are stored as instants on the meeting date. They are only ever used
  // for duration and punctuality, both of which compare against the client's
  // planned window in the same frame, so the date-local reading is the right one.
  const atTime = (hhmm: FormDataEntryValue | null): Date | null =>
    typeof hhmm === "string" && HHMM.test(hhmm) ? new Date(`${meetingDate}T${hhmm}:00.000Z`) : null;
  const startedAt = atTime(startTimeInput);
  const endedAt = atTime(endTimeInput);
  const durationMinutes =
    startedAt && endedAt && endedAt > startedAt
      ? Math.round((endedAt.getTime() - startedAt.getTime()) / 60_000)
      : null;

  const row = await db.clientMeetingTranscript.create({
    data: {
      orgId,
      clientId,
      type,
      meetingDate: new Date(`${meetingDate}T00:00:00.000Z`),
      title,
      rawText,
      source: "manual",
      attendees: attendeeMembers.map((m) => ({ name: m.name, email: m.email })),
      // Only claim the list is human-authored when a human actually supplied
      // one. An empty list must stay indistinguishable from "not asked",
      // otherwise an uploader who skipped the field marks the whole team absent.
      attendeesSource: attendeeMembers.length ? "manual" : null,
      startedAt,
      endedAt,
      durationMinutes,
      fathomRecordingId: `manual-${crypto.randomUUID()}`,
      matchStatus: "MATCHED",
      createdBy: userId,
    },
    select: {
      id: true,
      clientId: true,
      type: true,
      meetingDate: true,
      title: true,
      recordingUrl: true,
      startedAt: true,
      endedAt: true,
      durationMinutes: true,
      attendees: true,
      summary: true,
      actionItems: true,
      rawText: true,
      rawSegments: true,
      matchStatus: true,
    },
  });

  return NextResponse.json({ success: true, data: { ...row, clientName: client.name } }, { status: 201 });
});
