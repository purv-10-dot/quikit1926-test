import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { parseDocxTranscript, DocxTranscriptError, DOCX_MIME, MAX_DOCX_BYTES } from "@/lib/services/docxTranscript";

export const runtime = "nodejs";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dashboard");

/**
 * POST /api/client-meetings/transcripts/upload — manually add a meeting
 * transcript from a `.docx` file (multipart form: file, clientId, type,
 * meetingDate, title?) when no Fathom recording exists for a meeting. The
 * resulting row is a normal `ClientMeetingTranscript` (`source: "manual"`)
 * so the existing viewer, export, and Gemini report-generation routes work
 * on it unchanged.
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

  const client = await db.client.findFirst({ where: { id: clientId, orgId }, select: { name: true } });
  if (!client) {
    return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
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

  const row = await db.clientMeetingTranscript.create({
    data: {
      orgId,
      clientId,
      type,
      meetingDate: new Date(`${meetingDate}T00:00:00.000Z`),
      title,
      rawText,
      source: "manual",
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
      matchStatus: true,
    },
  });

  return NextResponse.json({ success: true, data: { ...row, clientName: client.name } }, { status: 201 });
});
