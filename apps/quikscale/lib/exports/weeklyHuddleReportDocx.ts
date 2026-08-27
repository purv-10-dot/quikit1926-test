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
import {
  buildWeeklyAdherenceSnapshot,
  SNAPSHOT_FLAG_LABEL,
  type SnapshotFlag,
} from "@/lib/ai/weeklyAdherenceSnapshot";

const HEADER_FILL = "EFF6FF";
const LABEL_FILL = "F8FAFC";

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n}%`);

/** Suffix marking a member who is shown but not scored. */
const TYPE_LABEL: Record<string, string> = { OPTIONAL: "Optional", EXTERNAL: "External" };

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
};

const ATTENDANCE_MARK: Record<string, string> = {
  PRESENT: "✓",
  PARTIAL: "◐",
  ABSENT: "✗",
  NA: "NA",
  // No evidence either way — never rendered as an absence.
  UNKNOWN: "—",
};

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

/** A muted caption under a table — same treatment the other notes already use. */
const note = (text: string) =>
  new Paragraph({
    children: [new TextRun({ text, size: 16, italics: true, color: "64748B" })],
    spacing: { before: 60 },
  });

const flag = (v: SnapshotFlag | null) => (v ? SNAPSHOT_FLAG_LABEL[v] : "—");

/** Loose report rows carry `unknown`; render a string or nothing. */
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Build the Word document for a generated weekly report. */
export function buildWeeklyReportDocx(report: StoredWeeklyReport, orgName: string): Document {
  const { meetingDetails: md, executive, attendance, heatMap, stucks, facilitatorObservations: fo } = report;
  const team = heatMap.teamAverage;
  const snapshot = buildWeeklyAdherenceSnapshot(heatMap);
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
                cell(
                  row.unmapped
                    ? `${row.name}  [Unmapped]`
                    : row.attendanceType === "REQUIRED"
                      ? row.name
                      : `${row.name}  [${TYPE_LABEL[row.attendanceType]}]`,
                ),
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

  // §4.4 Adherence — Snapshot first, then the Heat Map it derives from. One
  // section, so 5–8 keep their existing numbers.
  if (heatMap.rows.length) {
    children.push(h2("4. Adherence"));

    children.push(h3("Adherence Snapshot"));
    children.push(
      note(
        "Rating Scale: Yes — complete, specific answer given. Partial — vague or incomplete. No — not addressed.",
      ),
    );
    children.push(
      table([
        headerRow(["Participant", "Achievement", "Focus", "Stuck / Blockers", "Score", "Rating"]),
        ...snapshot.rows.map(
          (row) =>
            new TableRow({
              children: [
                cell(row.unmapped ? `${row.participant}  [Unmapped]` : row.participant),
                cell(flag(row.achievement), { align: true }),
                cell(flag(row.focus), { align: true }),
                cell(flag(row.stuck), { align: true }),
                cell(row.scoreLabel ?? "—", { align: true }),
                cell(row.rating ?? "—", { align: true, bold: true }),
              ],
            }),
        ),
        new TableRow({
          children: [
            cell("Totals (roster only)", { bold: true, fill: LABEL_FILL }),
            cell(`Full ${snapshot.tiles.full}`, { align: true, fill: LABEL_FILL }),
            cell(`Good ${snapshot.tiles.good}`, { align: true, fill: LABEL_FILL }),
            cell(`Partial ${snapshot.tiles.partial}`, { align: true, fill: LABEL_FILL }),
            cell(`Poor ${snapshot.tiles.poor}`, { align: true, fill: LABEL_FILL }),
            cell(`Attendees ${snapshot.tiles.total}`, { align: true, bold: true, fill: LABEL_FILL }),
          ],
        }),
      ]),
    );
    children.push(
      note(
        "A flag summarises the whole week: answering on some days but not others reads as Partial. Totals count roster members only.",
      ),
    );

    children.push(h3("Adherence Heat Map"));
    children.push(
      table([
        headerRow(["Team Member", "Yesterday Achievement", "Today Focus", "Stuck", "Avg Score"]),
        ...heatMap.rows.map(
          (row) =>
            new TableRow({
              children: [
                cell(row.memberId === null ? `${row.participant}  [Unmapped]` : row.participant),
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
  // ── 7. WWW Review ─────────────────────────────────────────────────────────
  //
  // Rendered from the STORED report, like every other section: a download can
  // never trigger a query or a model call. Rows are loosely typed because the
  // shape is owned by `lib/reports/wwwReview.ts`.
  const reviewRows = (report.wwwReview?.rows ?? []) as Record<string, unknown>[];
  children.push(h2("7. WWW Review"));
  if (reviewRows.length) {
    children.push(
      table([
        headerRow(["Owner", "WWW", "Previous Status", "Current Status", "Change"]),
        ...reviewRows.map(
          (r) =>
            new TableRow({
              children: [
                cell(str(r.whoName) || "Unassigned", { width: 16 }),
                cell(str(r.what) || "—", { width: 36 }),
                // Never blank: a blank cell reads as "no change", which is a
                // claim about the meeting that nobody made.
                cell(str(r.statusAtMeeting) || "Not recorded", { width: 16 }),
                cell(str(r.currentStatus) || "—", { width: 16 }),
                cell(str(r.changeLabel) || "—", { width: 16 }),
              ],
            }),
        ),
      ]),
    );
  } else {
    children.push(
      new Paragraph({
        text:
          str(report.wwwReview?.unavailableReason) ||
          "No previously-created WWW item was discussed this week.",
      }),
    );
  }

  // ── 8. New WWW ────────────────────────────────────────────────────────────
  const newRows = (report.newWww?.rows ?? []) as Record<string, unknown>[];
  children.push(h2("8. WWW / New Action Items"));
  if (newRows.length) {
    children.push(
      table([
        headerRow(["Who", "What", "When", "Status"]),
        ...newRows.map((r) => {
          const who = r.who as { userName?: string } | null | undefined;
          const missing = Array.isArray(r.missingFields) ? (r.missingFields as string[]) : [];
          return new TableRow({
            children: [
              cell(who?.userName || str(r.whoRaw) || "Not identified", { width: 18 }),
              cell(str(r.what) || "—", { width: 46 }),
              // The doc is explicit: an unstated date is flagged, never invented.
              cell(r.whenMissing ? "Not specified" : str(r.whenText) || "Not specified", {
                width: 18,
              }),
              cell(
                r.linkedWwwItemId
                  ? "Created"
                  : r.dismissedAt
                    ? "Dismissed"
                    : missing.length
                      ? `Needs ${missing.join(" & ")}`
                      : "Ready",
                { width: 18 },
              ),
            ],
          });
        }),
      ]),
    );
  } else if (report.wwwSuggestions.length) {
    // A report generated before these sections existed still shows its action
    // items rather than appearing to have found none.
    children.push(
      table([
        headerRow(["Who", "What", "When"]),
        ...report.wwwSuggestions.map(
          (w) =>
            new TableRow({
              children: [
                cell(w.who || "—", { width: 20 }),
                cell(w.what, { width: 60 }),
                cell(w.when || "Not stated — flagged", { width: 20 }),
              ],
            }),
        ),
      ]),
    );
  } else {
    children.push(
      new Paragraph({
        text:
          str(report.newWww?.unavailableReason) ||
          "No new action items were identified this week.",
      }),
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
