/**
 * The Week Rollup as a Word document.
 *
 * Rendered from the STORED report, never from a request body, so a download can
 * only ever contain what was generated. No model is called.
 *
 * The order says what the report is for: what happened this week, then what
 * crossed both rhythms, then where the week sits against recent ones. A reader
 * who wanted the meetings one at a time would open those reports instead.
 *
 * Built with the `docx` library. `html-to-docx` output does not open in Word.
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

import type { StoredWeekRollupReport } from "@/lib/reports/weekRollupCompose";

const HEADER_FILL = "EFF6FF";
const CAVEAT_FILL = "FEF3C7";
const ALERT_FILL = "FEE2E2";

const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n}%`;

const num = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : String(n);

/** Plain words, not arrows — arrows do not survive every Word install. */
const DIRECTION_LABEL: Record<string, string> = {
  IMPROVING: "Improving",
  DECLINING: "Declining",
  STABLE: "Steady",
  VOLATILE: "Volatile",
  INSUFFICIENT_DATA: "Not enough data",
};

function text(value: string, opts: { bold?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({
    text: value,
    bold: opts.bold,
    size: opts.size ?? 20,
    color: opts.color,
  });
}

function cell(
  value: string,
  opts: {
    bold?: boolean;
    fill?: string;
    width?: number;
    align?: (typeof AlignmentType)[keyof typeof AlignmentType];
  } = {},
) {
  return new TableCell({
    shading: opts.fill ? { fill: opts.fill } : undefined,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({ alignment: opts.align, children: [text(value, { bold: opts.bold })] }),
    ],
  });
}

function headerRow(labels: string[]) {
  return new TableRow({
    tableHeader: true,
    children: labels.map((l) => cell(l, { bold: true, fill: HEADER_FILL })),
  });
}

const table = (rows: TableRow[]) =>
  new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });

function heading(value: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    children: [text(value, { bold: true, size: 26 })],
  });
}

function note(value: string) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [text(value, { color: "6B7280" })],
  });
}

const bullets = (items: string[]): Paragraph[] =>
  items.map(
    (item) =>
      new Paragraph({
        bullet: { level: 0 },
        spacing: { before: 40, after: 40 },
        children: [text(item)],
      }),
  );

/**
 * What the week had, and what it did not.
 *
 * A missing source report means a report was not GENERATED. Rendering an empty
 * section instead would say the meetings did not happen, which is a different
 * and probably false statement.
 */
function coverageSection(report: StoredWeekRollupReport): (Paragraph | Table)[] {
  const c = report.coverage;
  const out: (Paragraph | Table)[] = [];

  const held: string[] = [];
  if (c.dhWeekly) held.push("daily huddles");
  if (c.weeklyMeetings > 0) {
    held.push(`${c.weeklyMeetings} weekly meeting${c.weeklyMeetings === 1 ? "" : "s"}`);
  }
  out.push(
    note(held.length ? `Built from: ${held.join(" and ")}.` : "No source reports for this week."),
  );

  if (c.missingSources.length > 0) {
    out.push(
      new Paragraph({
        shading: { fill: ALERT_FILL },
        spacing: { before: 80, after: 80 },
        children: [text("Not everything was reported on this week:", { bold: true })],
      }),
      ...bullets(c.missingSources),
      note("A missing report means nothing was generated — not that the meetings did not happen."),
    );
  }

  if (!c.complete && c.notes.length > 0) {
    out.push(
      new Paragraph({
        shading: { fill: CAVEAT_FILL },
        spacing: { before: 80, after: 80 },
        children: [
          text("Some source reports listed only part of what they recorded.", { bold: true }),
        ],
      }),
      ...bullets(c.notes),
    );
  }

  return out;
}

/**
 * Blockers, with the cross-rhythm ones first.
 *
 * That ordering is the report's whole argument: a problem raised in both the
 * daily huddles and the weekly meeting is the one thing neither source report
 * can see, so it leads.
 */
function blockerSection(report: StoredWeekRollupReport): (Paragraph | Table)[] {
  if (report.blockers.length === 0) {
    return [note("No blockers were raised in this week's meetings.")];
  }

  const ordered = [...report.blockers].sort(
    (a, b) =>
      Number(b.crossRhythm) - Number(a.crossRhythm) ||
      b.meetingsSeen - a.meetingsSeen ||
      b.occurrences - a.occurrences,
  );

  const rows = [headerRow(["Blocker", "Raised", "Meetings", "Raised by", "Status"])];
  for (const b of ordered) {
    rows.push(
      new TableRow({
        children: [
          cell(b.crossRhythm ? `${b.description}  ★` : b.description, { width: 38 }),
          cell(String(b.occurrences), { width: 10, align: AlignmentType.CENTER }),
          cell(String(b.meetingsSeen), { width: 10, align: AlignmentType.CENTER }),
          cell(b.raisedBy.slice(0, 4).join(", ") || "—", { width: 24 }),
          cell(b.latestStatusStated ?? "Never stated", { width: 18 }),
        ],
      }),
    );
  }

  const out: (Paragraph | Table)[] = [table(rows)];
  if (ordered.some((b) => b.crossRhythm)) {
    out.push(
      note(
        "★ Raised in both the daily huddles and the weekly meeting — the pattern neither report can see on its own.",
      ),
    );
  }
  if (report.blockerObservation) out.push(note(report.blockerObservation));
  return out;
}

function trendSection(report: StoredWeekRollupReport): (Paragraph | Table)[] {
  if (report.trends.length === 0) {
    return [note("Not enough history yet to compare this week with previous ones.")];
  }

  const rows = [headerRow(["Metric", "This week", "Movement", "Reading"])];
  for (const t of report.trends) {
    rows.push(
      new TableRow({
        children: [
          cell(t.metric, { width: 28 }),
          cell(num(t.last), { width: 14, align: AlignmentType.CENTER }),
          cell(DIRECTION_LABEL[t.direction] ?? t.direction, { width: 18 }),
          cell(t.summary, { width: 40 }),
        ],
      }),
    );
  }

  const out: (Paragraph | Table)[] = [table(rows)];
  if (report.materialTrends.length > 0) {
    out.push(note("Movements worth acting on:"), ...bullets(report.materialTrends));
  }
  return out;
}

function wwwSection(report: StoredWeekRollupReport): (Paragraph | Table)[] {
  const w = report.www;
  if (w.total === 0) return [note("No commitments were in scope for this week.")];

  const rows = [
    headerRow(["In scope", "Completed", "Overdue", "Carried forward", "Completion"]),
    new TableRow({
      children: [
        cell(String(w.total), { align: AlignmentType.CENTER }),
        cell(String(w.completed), { align: AlignmentType.CENTER }),
        cell(String(w.overdue), { align: AlignmentType.CENTER }),
        cell(String(w.carriedForward), { align: AlignmentType.CENTER }),
        cell(pct(w.completionRate), { align: AlignmentType.CENTER }),
      ],
    }),
  ];

  const out: (Paragraph | Table)[] = [table(rows)];
  if (w.averageDaysToClose !== null) {
    out.push(note(`Average time to close: ${w.averageDaysToClose} days.`));
  }
  if (report.wwwObservation) out.push(note(report.wwwObservation));
  return out;
}

/** Build the Word document for a stored Week Rollup. */
export function buildWeekRollupReportDocx(
  report: StoredWeekRollupReport,
  options: { orgName?: string | null; validated?: boolean } = {},
): Document {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [text("Week Rollup", { bold: true, size: 34 })],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [text(`${report.clientName} — ${report.label}`, { size: 24 })],
    }),
  ];

  if (options.orgName) {
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        children: [text(options.orgName, { color: "6B7280" })],
      }),
    );
  }

  if (!options.validated) {
    children.push(
      new Paragraph({
        shading: { fill: CAVEAT_FILL },
        spacing: { after: 160 },
        children: [text("DRAFT — not yet reviewed by the facilitator.", { bold: true })],
      }),
    );
  }

  children.push(...coverageSection(report));

  if (report.weekSummary) {
    children.push(heading("The week"), new Paragraph({ children: [text(report.weekSummary)] }));
  }

  children.push(heading("Blockers across the week"), ...blockerSection(report));
  children.push(heading("Week over week"), ...trendSection(report));
  children.push(heading("WWW commitments"), ...wwwSection(report));

  if (report.topics.length > 0) {
    children.push(heading("Workstreams"), ...bullets(report.topics));
  }
  if (report.keyObservations.length > 0) {
    children.push(heading("Key observations"), ...bullets(report.keyObservations));
  }
  if (report.recommendations.length > 0) {
    children.push(heading("Recommendations"), ...bullets(report.recommendations));
  }

  return new Document({
    creator: options.orgName ?? "QuikScale",
    title: `Week Rollup — ${report.clientName} — ${report.label}`,
    sections: [
      {
        properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
        children,
      },
    ],
  });
}
