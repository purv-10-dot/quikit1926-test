/**
 * Word (.docx) rendering of the Daily Huddle Weekly Report.
 *
 * Built with the `docx` library rather than an HTML-to-Word converter — that
 * route produces files Word refuses to open. Every §4.x section becomes a real
 * Word table so the deliverable is editable by the facilitator, not a picture
 * of a report.
 *
 * Pure: takes the stored report, returns a `Document`. The route packs it.
 */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { StoredWeeklyReport } from "@/lib/ai/weeklyHuddleCompose";

const HEADER_FILL = "EFF6FF";
const LABEL_FILL = "F8FAFC";

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n}%`);

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
};

const KIND_LABEL: Record<string, string> = {
  BLOCKER: "Blocker",
  KPI_RELATED: "KPI-related",
  PRIORITY_RELATED: "Priority-related",
  ACTION: "Action",
};

const ATTENDANCE_MARK: Record<string, string> = { PRESENT: "✓", ABSENT: "✗", NA: "NA" };

function cell(text: string, opts: { bold?: boolean; fill?: string; align?: boolean; width?: number } = {}) {
  return new TableCell({
    shading: opts.fill ? { fill: opts.fill } : undefined,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: [
      new Paragraph({
        alignment: opts.align ? AlignmentType.CENTER : undefined,
        children: [new TextRun({ text, bold: opts.bold, size: 18 })],
      }),
    ],
  });
}

function headerRow(labels: string[], centerFrom = 1) {
  return new TableRow({
    tableHeader: true,
    children: labels.map((l, i) => cell(l, { bold: true, fill: HEADER_FILL, align: i >= centerFrom })),
  });
}

function table(rows: TableRow[]) {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function h2(text: string) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 120 } });
}

function h3(text: string) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 80 } });
}

const spacer = () => new Paragraph({ text: "", spacing: { after: 80 } });

/** Build the Word document for a generated weekly report. */
export function buildWeeklyReportDocx(report: StoredWeeklyReport, orgName: string): Document {
  const { meetingDetails: md, executive, attendance, heatMap, stucks, facilitatorObservations: fo } = report;
  const team = heatMap.teamAverage;
  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(
    new Paragraph({ text: "Daily Huddle Weekly Report", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun({ text: `${orgName} · ${report.clientName} · ${report.weekLabel}`, size: 18, color: "64748B" }),
      ],
      spacing: { after: 200 },
    }),
  );

  // §4.1 Meeting Details
  children.push(h2("1. Meeting Details"));
  children.push(
    table(
      (
        [
          ["Meeting Type", md.meetingType],
          ["Week", md.weekLabel],
          ["Planned Start Time", md.plannedStartTime ?? "—"],
          ["Planned End Time", md.plannedEndTime ?? "—"],
          ["Planned Duration", md.plannedDurationMinutes ? `${md.plannedDurationMinutes} minutes` : "—"],
          ["Day DH doesn't happen", md.nonHuddleDay ? md.nonHuddleDay.replace(/^./, (c) => c.toUpperCase()) : "—"],
          ["# of team members", String(md.teamMemberCount)],
        ] as const
      ).map(
        ([label, value]) =>
          new TableRow({
            children: [cell(label, { bold: true, fill: LABEL_FILL, width: 35 }), cell(String(value), { width: 65 })],
          }),
      ),
    ),
  );

  // §4.2 Executive Summary
  children.push(h2("2. Executive Summary"));
  children.push(
    table([
      headerRow(["Metric", "Value"]),
      ...(
        [
          ["Daily Huddles Planned", String(executive.metrics.huddlesPlanned)],
          ["Daily Huddles Conducted", String(executive.metrics.huddlesConducted)],
          ["Average Attendance", pct(executive.metrics.averageAttendancePct)],
          ["Meeting Started on time", pct(executive.metrics.startedOnTimePct)],
          [
            "Average Meeting Duration",
            executive.metrics.averageDurationMinutes === null ? "—" : `${executive.metrics.averageDurationMinutes} mins`,
          ],
        ] as const
      ).map(([k, v]) => new TableRow({ children: [cell(k, { width: 65 }), cell(v, { align: true, width: 35 })] })),
    ]),
  );

  children.push(h3("Agenda Adherence (Team)"));
  children.push(
    table([
      headerRow(["Agenda Item", "Adherence"]),
      ...(
        [
          ["Yesterday Achievement", pct(team.achievementPct)],
          ["Today's Focus", pct(team.focusPct)],
          ["Stucks", pct(team.stuckPct)],
        ] as const
      ).map(([k, v]) => new TableRow({ children: [cell(k, { width: 65 }), cell(v, { align: true, width: 35 })] })),
    ]),
  );

  if (executive.keyHighlights.length) {
    children.push(h3("Key Highlights"));
    for (const highlight of executive.keyHighlights) {
      children.push(new Paragraph({ text: highlight, bullet: { level: 0 } }));
    }
  }

  // §4.3 Attendance Analysis
  if (attendance.rows.length) {
    children.push(h2("3. Attendance Analysis"));
    children.push(
      table([
        headerRow(["Team Member", ...attendance.columns.map((c) => c.weekday), "Attendance %"]),
        ...attendance.rows.map(
          (row) =>
            new TableRow({
              children: [
                cell(row.name),
                ...row.cells.map((c) => cell(ATTENDANCE_MARK[c.state] ?? "—", { align: true })),
                cell(pct(row.attendancePct), { align: true, bold: true }),
              ],
            }),
        ),
      ]),
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "NA = no huddle held that day, or the member was on planned leave — excluded from the percentage.",
            size: 16,
            italics: true,
            color: "64748B",
          }),
        ],
        spacing: { before: 60 },
      }),
    );
  }

  // §4.4 Adherence Heat Map
  if (heatMap.rows.length) {
    children.push(h2("4. Adherence Heat Map"));
    children.push(
      table([
        headerRow(["Team Member", "Yesterday Achievement", "Today Focus", "Stuck", "Avg Score"]),
        ...heatMap.rows.map(
          (row) =>
            new TableRow({
              children: [
                cell(row.participant),
                cell(pct(row.achievementPct), { align: true }),
                cell(pct(row.focusPct), { align: true }),
                cell(pct(row.stuckPct), { align: true }),
                cell(pct(row.avgScorePct), { align: true, bold: true }),
              ],
            }),
        ),
        new TableRow({
          children: [
            cell("Team Average", { bold: true, fill: LABEL_FILL }),
            cell(pct(team.achievementPct), { align: true, bold: true, fill: LABEL_FILL }),
            cell(pct(team.focusPct), { align: true, bold: true, fill: LABEL_FILL }),
            cell(pct(team.stuckPct), { align: true, bold: true, fill: LABEL_FILL }),
            cell("–", { align: true, fill: LABEL_FILL }),
          ],
        }),
      ]),
    );
    if (heatMap.unrecognized.length) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Excluded — could not be matched to the client roster: ${heatMap.unrecognized
                .map((u) => `${u.name} (${u.reason})`)
                .join(", ")}`,
              size: 16,
              italics: true,
              color: "B45309",
            }),
          ],
          spacing: { before: 60 },
        }),
      );
    }
  }

  // §4.5 Stucks & Blockers
  children.push(h2("5. Stucks & Blockers"));
  children.push(h3("A. All Stucks Raised During the Week"));
  if (stucks.all.length) {
    children.push(
      table([
        headerRow(["Date", "Raised By", "Raised For", "Blocker", "Status"], 5),
        ...stucks.all.map(
          (b) =>
            new TableRow({
              children: [
                cell(b.date, { width: 12 }),
                cell(b.raisedBy, { width: 16 }),
                cell(b.raisedFor ?? "—", { width: 16 }),
                cell(b.impact ? `${b.description} — Impact: ${b.impact}` : b.description, { width: 44 }),
                cell(b.status ? STATUS_LABEL[b.status] : "—", { width: 12 }),
              ],
            }),
        ),
      ]),
    );
  } else {
    children.push(new Paragraph({ text: "No stucks were raised this week." }));
  }

  children.push(h3("B. Recurring Stucks"));
  if (stucks.recurring.length) {
    children.push(
      table([
        headerRow(["Blocker", "# of Occurrences", "Raised By", "Raised For", "Current Status"]),
        ...stucks.recurring.map(
          (g) =>
            new TableRow({
              children: [
                cell(g.blocker, { width: 36 }),
                cell(String(g.occurrences), { align: true, width: 16 }),
                cell(g.raisedBy.join(", ") || "—", { width: 18 }),
                cell(g.raisedFor.join(", ") || "—", { width: 18 }),
                cell(g.status ? STATUS_LABEL[g.status] : "—", { width: 12 }),
              ],
            }),
        ),
      ]),
    );
  } else {
    children.push(new Paragraph({ text: "No stuck recurred this week." }));
  }

  // §4.6 Facilitator Observations
  children.push(h2("6. Facilitator Observations & Recommendations"));
  children.push(
    table(
      (
        [
          ["Attendance & Participation", fo.attendanceParticipation],
          ["Strong Performers", fo.strongPerformers],
          ["Achievement Gap", fo.achievementGap],
          ["Focus Specificity", fo.focusSpecificity],
          ["Stuck Protocol", fo.stuckProtocol],
          ["Recommendations", fo.recommendations],
        ] as const
      ).map(
        ([label, obs]) =>
          new TableRow({
            children: [cell(label, { bold: true, fill: LABEL_FILL, width: 28 }), cell(obs.text, { width: 72 })],
          }),
      ),
    ),
  );

  // WWW suggestions
  if (report.wwwSuggestions.length) {
    children.push(h2("7. WWW Suggestions"));
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Drawn from this week's stucks and discussion points. Nothing here is created automatically.",
            size: 16,
            italics: true,
            color: "64748B",
          }),
        ],
        spacing: { after: 100 },
      }),
    );
    children.push(
      table([
        headerRow(["Who", "What", "When", "Source"]),
        ...report.wwwSuggestions.map(
          (w) =>
            new TableRow({
              children: [
                cell(w.who || "—", { width: 16 }),
                cell(`${w.what}  [${KIND_LABEL[w.kind] ?? w.kind}]`, { width: 48 }),
                // The doc is explicit: an unstated date is flagged, never invented.
                cell(w.when || "Not stated — flagged", { width: 16 }),
                cell(w.sourceDate ?? "—", { width: 20 }),
              ],
            }),
        ),
      ]),
    );
  }

  children.push(spacer());
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated by ${orgName} · QuikScale · ${report.weekLabel}`,
          size: 15,
          italics: true,
          color: "94A3B8",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 240 },
    }),
  );

  return new Document({ sections: [{ children }] });
}
