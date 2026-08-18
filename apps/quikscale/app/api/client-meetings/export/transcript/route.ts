import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";

export const runtime = "nodejs";

const withOrgAuth = withOrgAuthForModule("clientMeetings.dashboard");

/**
 * POST /api/client-meetings/export/transcript { id } — download one saved
 * meeting transcript as a Word (.docx) document. Org-scoped. Mirrors the other
 * client-meetings export routes (blob response the client saves via <a download>),
 * but uses `docx` (not exceljs) since a transcript is prose, not a grid.
 */
export const POST = withOrgAuth(async ({ orgId }, request) => {
  const body = (await request.json().catch(() => null)) as { id?: string } | null;
  const id = body?.id;
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing transcript id" }, { status: 400 });
  }

  const t = await db.clientMeetingTranscript.findFirst({
    where: { id, orgId, deletedAt: null },
    select: {
      title: true,
      type: true,
      meetingDate: true,
      startedAt: true,
      durationMinutes: true,
      attendees: true,
      summary: true,
      actionItems: true,
      rawText: true,
      client: { select: { name: true } },
    },
  });
  if (!t) {
    return NextResponse.json({ success: false, error: "Transcript not found" }, { status: 404 });
  }

  const attendees = Array.isArray(t.attendees)
    ? (t.attendees as { name?: string | null; email?: string | null }[])
        .map((a) => a?.name || a?.email)
        .filter(Boolean)
        .join(", ")
    : "";
  const actionItems = Array.isArray(t.actionItems)
    ? (t.actionItems as { text?: string }[]).map((a) => a?.text).filter(Boolean)
    : [];

  const meta = (label: string, value: string) =>
    new Paragraph({ children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)] });

  const children: Paragraph[] = [
    new Paragraph({ text: t.title || "Meeting transcript", heading: HeadingLevel.HEADING_1 }),
    meta("Client", t.client?.name ?? "—"),
    meta("Type", t.type ?? "—"),
    meta("Date", t.meetingDate ? new Date(t.meetingDate).toISOString().slice(0, 10) : "—"),
    meta("Duration", t.durationMinutes != null ? `${t.durationMinutes} min` : "—"),
    meta("Attendees", attendees || "—"),
  ];

  if (t.summary) {
    children.push(new Paragraph({ text: "Summary", heading: HeadingLevel.HEADING_2 }));
    for (const line of t.summary.split("\n")) children.push(new Paragraph(line));
  }
  if (actionItems.length) {
    children.push(new Paragraph({ text: "Action items", heading: HeadingLevel.HEADING_2 }));
    for (const item of actionItems) children.push(new Paragraph({ text: item, bullet: { level: 0 } }));
  }
  children.push(new Paragraph({ text: "Transcript", heading: HeadingLevel.HEADING_2 }));
  for (const line of (t.rawText ?? "No transcript text.").split("\n")) children.push(new Paragraph(line));

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);

  const safeName = (t.title || t.client?.name || "transcript").replace(/[^\w.-]+/g, "_").slice(0, 60);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}.docx"`,
    },
  });
});
