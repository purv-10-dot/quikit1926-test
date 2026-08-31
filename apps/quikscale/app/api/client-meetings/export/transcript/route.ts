import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { cleanFathomSummary, parseSummaryBlocks } from "@/lib/meetings/summaryFormat";
import { buildTranscriptTurns, type DisplaySegmentInput } from "@/lib/meetings/transcriptView";
import {
  actionItemMeta,
  attendeesToPlainText,
  type ActionItemInput,
  type AttendeeInput,
} from "@/lib/meetings/meetingParts";

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
      rawSegments: true,
      client: { select: { name: true } },
    },
  });
  if (!t) {
    return NextResponse.json({ success: false, error: "Transcript not found" }, { status: 404 });
  }

  // Same helpers the viewer and the .txt download use, so all three renderings
  // of these fields agree by construction rather than by discipline.
  const attendees = attendeesToPlainText(Array.isArray(t.attendees) ? (t.attendees as AttendeeInput[]) : null);
  const actionItems = Array.isArray(t.actionItems)
    ? (t.actionItems as ActionItemInput[]).filter((a) => a?.text?.trim())
    : [];

  const meta = (label: string, value: string) =>
    new Paragraph({ children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(value)] });

  const children: Paragraph[] = [
    new Paragraph({ text: t.title || "Meeting transcript", heading: HeadingLevel.HEADING_1 }),
    meta("Client", t.client?.name ?? "—"),
    meta("Type", t.type ?? "—"),
    meta("Date", t.meetingDate ? new Date(t.meetingDate).toISOString().slice(0, 10) : "—"),
    meta("Duration", t.durationMinutes != null ? `${t.durationMinutes} min` : "—"),
  ];

  // `attendeesToPlainText` emits either one flat list or two labelled lines
  // ("Attendees: …" / "Invited: …"), so each line becomes its own paragraph —
  // a docx Paragraph does not honour "\n".
  if (attendees) {
    for (const line of attendees.split("\n")) {
      const [label, ...rest] = line.split(": ");
      children.push(rest.length ? meta(label, rest.join(": ")) : new Paragraph(line));
    }
  } else {
    children.push(meta("Attendees", "—"));
  }

  // Fathom's summary is markdown whose bullets end in a citation link back into
  // the recording. Rendered verbatim it put a raw URL on every line of the
  // export, so it is cleaned and structured here — the stored value is untouched.
  const summaryBlocks = parseSummaryBlocks(cleanFathomSummary(t.summary));
  if (summaryBlocks.length) {
    children.push(new Paragraph({ text: "Summary", heading: HeadingLevel.HEADING_2 }));
    for (const b of summaryBlocks) {
      if (b.kind === "heading") {
        children.push(new Paragraph({ children: [new TextRun({ text: b.text, bold: true })] }));
      } else if (b.kind === "bullet") {
        children.push(new Paragraph({ text: b.text, bullet: { level: 0 } }));
      } else {
        children.push(new Paragraph(b.text));
      }
    }
  }
  if (actionItems.length) {
    children.push(new Paragraph({ text: "Action items", heading: HeadingLevel.HEADING_2 }));
    for (const item of actionItems) {
      // Timestamp and assignee as a lighter run after the text, mirroring the
      // "@ 0:49 · Rohit Deshmukh" line the viewer shows.
      const meta = actionItemMeta(item);
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun(item.text!.trim()),
            ...(meta.length ? [new TextRun({ text: `  (${meta.join(" · ")})`, italics: true })] : []),
          ],
        }),
      );
    }
  }

  // Speaker turns, matching the viewer. Prefers the structured segments (real
  // timings) and otherwise parses rawText — including Fathom's glued
  // `Name  0:09Text` .docx grammar.
  children.push(new Paragraph({ text: "Transcript", heading: HeadingLevel.HEADING_2 }));
  const turns = buildTranscriptTurns({
    rawText: t.rawText,
    rawSegments: Array.isArray(t.rawSegments) ? (t.rawSegments as DisplaySegmentInput[]) : null,
  });
  if (turns.length === 0) {
    children.push(new Paragraph("No transcript text."));
  } else {
    for (const turn of turns) {
      const head = [turn.speaker, turn.time].filter(Boolean).join("  ");
      if (head) children.push(new Paragraph({ children: [new TextRun({ text: head, bold: true })] }));
      for (const line of turn.text.split("\n")) children.push(new Paragraph(line));
      children.push(new Paragraph(""));
    }
  }

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
