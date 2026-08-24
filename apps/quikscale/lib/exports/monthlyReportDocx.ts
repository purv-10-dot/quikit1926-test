/**
 * Word (.docx) rendering of the Monthly Report.
 *
 * Built with the `docx` library rather than an HTML-to-Word converter — that
 * route produces files Word refuses to open. Every section becomes a real Word
 * table so the facilitator can edit the deliverable, not just look at a picture
 * of one.
 *
 * Pure: takes the stored report, returns a `Document`. The route packs it and
 * reads the report from storage, never from the request body — so a download
 * can only ever contain what was generated and validated.
 *
 * WHAT THIS RENDERS THAT THE WEEKLY REPORT CANNOT
 * -----------------------------------------------
 * Week-over-week movement. The requirement doc forbids the DH Weekly Report
 * from showing comparisons and makes the Monthly Report the place they belong,
 * so the trend table with its W1 → W4 series is the centrepiece here.
 *
 * COVERAGE IS STATED BEFORE ANY CONCLUSION
 * ----------------------------------------
 * A month missing a week is not a month with a dip. The coverage line goes
 * first, before the trends, so a reader knows what the numbers are drawn from
 * before they read them — rather than discovering the gap in a footnote after
 * forming a view.
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

import type { StoredMonthlyReport } from "@/lib/reports/monthlyCompose";

const HEADER_FILL = "EFF6FF";
const LABEL_FILL = "F8FAFC";
const CAVEAT_FILL = "FEF3C7";

const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n}%`;

const num = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : String(n);

/** Plain-word direction labels — arrows do not survive every Word install. */
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
  opts: { bold?: boolean; fill?: string; width?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {},
) {
  return new TableCell({
    shading: opts.fill ? { fill: opts.fill } : undefined,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [text(value, { bold: opts.bold })],
      }),
    ],
  });
}

function headerRow(labels: string[]) {
  return new TableRow({
    tableHeader: true,
    children: labels.map((l) => cell(l, { bold: true, fill: HEADER_FILL })),
  });
}

function table(rows: TableRow[]) {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function heading(value: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    children: [text(value, { bold: true, size: 26 })],
  });
}

function spacer() {
  return new Paragraph({ text: "", spacing: { after: 120 } });
}

function bullets(items: string[]): Paragraph[] {
  return items.map(
    (item) =>
      new Paragraph({
        bullet: { level: 0 },
        spacing: { before: 40, after: 40 },
        children: [text(item)],
      }),
  );
}

/**
 * Coverage, stated before anything else.
 *
 * When a week is missing this is a caveat box, not a footnote: the reader needs
 * it before they interpret a trend, not after.
 */
function coverageSection(report: StoredMonthlyReport): (Paragraph | Table)[] {
  const c = report.coverage;
  const complete = c.missingWeeks.length === 0;

  const lines: (Paragraph | Table)[] = [
    table([
      headerRow(["Coverage", "Value"]),
      new TableRow({
        children: [
          cell("Weeks in the month", { fill: LABEL_FILL, width: 40 }),
          cell(String(c.weeksTotal)),
        ],
      }),
      new TableRow({
        children: [
          cell("Weeks with a report", { fill: LABEL_FILL }),
          cell(`${c.weeksReported} of ${c.weeksTotal}`),
        ],
      }),
      new TableRow({
        children: [
          cell("Weekly meetings included", { fill: LABEL_FILL }),
          cell(c.weeklyMeetingsIncluded ? "Yes" : "Not yet available"),
        ],
      }),
    ]),
  ];

  if (!complete) {
    lines.push(
      new Paragraph({
        shading: { fill: CAVEAT_FILL },
        spacing: { before: 160, after: 80 },
        children: [
          text(
            `Note: ${c.missingWeeks.join(", ")} ${c.missingWeeks.length === 1 ? "has" : "have"} no report. ` +
              "Figures below are drawn only from the weeks that do, and no conclusion is drawn about the missing time.",
            { bold: true },
          ),
        ],
      }),
    );
  }

  if (!c.weeklyMeetingsIncluded) {
    lines.push(
      new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [
          text(
            "Weekly meeting data is not included in this period. Trends below cover the daily huddle rhythm only.",
            { color: "6B7280" },
          ),
        ],
      }),
    );
  }

  return lines;
}

/**
 * The trend table — the whole reason a monthly report exists.
 *
 * Each row shows the per-week series alongside the direction, so a reader can
 * check the call against the numbers rather than taking "Declining" on trust.
 */
function trendsSection(report: StoredMonthlyReport): (Paragraph | Table)[] {
  if (report.trends.length === 0) {
    return [new Paragraph({ children: [text("No trend data for this period.")] })];
  }

  const weekLabels = report.trends[0]?.points.map((p) => p.label) ?? [];

  const rows: TableRow[] = [
    headerRow(["Metric", ...weekLabels, "Change", "Direction"]),
    ...report.trends.map((t) =>
      new TableRow({
        children: [
          cell(t.summary.split(" ").slice(0, 4).join(" ").replace(/[.,]$/, ""), {
            fill: LABEL_FILL,
          }),
          ...t.points.map((p) =>
            cell(p.value === null ? "—" : String(p.value), {
              align: AlignmentType.CENTER,
            }),
          ),
          cell(t.delta === null ? "—" : `${t.delta > 0 ? "+" : ""}${t.delta}`, {
            align: AlignmentType.CENTER,
          }),
          cell(DIRECTION_LABEL[t.direction] ?? t.direction, {
            bold: t.significant,
            align: AlignmentType.CENTER,
          }),
        ],
      }),
    ),
  ];

  const out: (Paragraph | Table)[] = [table(rows)];

  if (report.materialTrends.length > 0) {
    out.push(spacer());
    out.push(
      new Paragraph({ children: [text("Most material movement", { bold: true })] }),
    );
    out.push(...bullets(report.materialTrends));
  }

  return out;
}

function wwwSection(report: StoredMonthlyReport): (Paragraph | Table)[] {
  const w = report.www;
  if (w.total === 0) {
    return [new Paragraph({ children: [text("No WWW commitments in scope this period.")] })];
  }

  const out: (Paragraph | Table)[] = [
    table([
      headerRow(["Commitments", "Count", "Rate"]),
      new TableRow({
        children: [
          cell("Completed", { fill: LABEL_FILL }),
          cell(num(w.completed), { align: AlignmentType.CENTER }),
          cell(pct(w.completionRate), { align: AlignmentType.CENTER }),
        ],
      }),
      new TableRow({
        children: [
          cell("Overdue", { fill: LABEL_FILL }),
          cell(num(w.overdue), { align: AlignmentType.CENTER }),
          cell(pct(w.overdueRate), { align: AlignmentType.CENTER }),
        ],
      }),
      new TableRow({
        children: [
          cell("Carried forward", { fill: LABEL_FILL }),
          cell(num(w.carriedForward), { align: AlignmentType.CENTER }),
          cell(pct(w.carryForwardRate), { align: AlignmentType.CENTER }),
        ],
      }),
      new TableRow({
        children: [
          cell("Cancelled", { fill: LABEL_FILL }),
          cell(num(w.cancelled), { align: AlignmentType.CENTER }),
          cell("—", { align: AlignmentType.CENTER }),
        ],
      }),
      new TableRow({
        children: [
          cell("Total in scope", { fill: LABEL_FILL, bold: true }),
          cell(num(w.total), { bold: true, align: AlignmentType.CENTER }),
          cell("", { align: AlignmentType.CENTER }),
        ],
      }),
    ]),
    spacer(),
    new Paragraph({
      children: [
        text(
          w.averageDaysToClose === null
            ? "Average time to close: not enough completed items to measure."
            : `Average time to close: ${w.averageDaysToClose} days.`,
        ),
      ],
    }),
    // Stated so nobody reads the completion rate as harsher than it is.
    new Paragraph({
      spacing: { after: 80 },
      children: [
        text(
          "Rates exclude cancelled items — a withdrawn commitment was never one anybody failed to meet.",
          { color: "6B7280" },
        ),
      ],
    }),
  ];

  if (report.wwwObservation) {
    out.push(new Paragraph({ children: [text(report.wwwObservation)] }));
  }

  return out;
}

function recurringSection(report: StoredMonthlyReport): (Paragraph | Table)[] {
  if (report.recurringStucks.length === 0) {
    return [
      new Paragraph({
        children: [text("No blocker recurred across more than one huddle this period.")],
      }),
    ];
  }

  return [
    table([
      headerRow(["Blocker", "Times raised", "Weeks seen", "Raised by", "Last stated status"]),
      ...report.recurringStucks.map(
        (s) =>
          new TableRow({
            children: [
              cell(s.description),
              cell(String(s.occurrences), { align: AlignmentType.CENTER }),
              cell(String(s.weeksSeen), { align: AlignmentType.CENTER }),
              cell(s.raisedBy.join(", ")),
              // Never invented: a blocker's real status lives in the business
              // record, not in a sentence somebody said.
              cell(s.latestStatusStated ?? "Not stated"),
            ],
          }),
      ),
    ]),
  ];
}

function noStuckSection(report: StoredMonthlyReport): (Paragraph | Table)[] {
  if (report.noStuckOutliers.length === 0) return [];

  return [
    heading('Frequent "No Stuck" reporting'),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        text(
          "Consistently reporting no blockers is worth a facilitator question. It is not a fault, " +
            "and nothing here implies anything is being withheld.",
          { color: "6B7280" },
        ),
      ],
    }),
    table([
      headerRow(["Member", '"No Stuck" rate', "Huddles attended", "Stuck adherence"]),
      ...report.noStuckOutliers.map(
        (o) =>
          new TableRow({
            children: [
              cell(o.name, { fill: LABEL_FILL }),
              cell(pct(o.noStuckRate), { align: AlignmentType.CENTER }),
              cell(String(o.huddlesAttended), { align: AlignmentType.CENTER }),
              cell(pct(o.stuckAdherencePct), { align: AlignmentType.CENTER }),
            ],
          }),
      ),
    ]),
  ];
}

/** Build the Word document for a stored Monthly Report. */
export function buildMonthlyReportDocx(
  report: StoredMonthlyReport,
  options: { orgName?: string | null; validated?: boolean } = {},
): Document {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [text("Monthly Report", { bold: true, size: 34 })],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [text(`${report.clientName} — ${report.periodLabel}`, { size: 24 })],
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

  // A report that has not been signed off says so on its face, so an unreviewed
  // draft cannot be circulated as if it were final.
  if (!options.validated) {
    children.push(
      new Paragraph({
        shading: { fill: CAVEAT_FILL },
        spacing: { after: 160 },
        children: [
          text("DRAFT — not yet reviewed by the facilitator.", { bold: true }),
        ],
      }),
    );
  }

  children.push(heading("Coverage"), ...coverageSection(report));
  children.push(heading("Trends across the month"), ...trendsSection(report));

  if (report.keyObservations.length > 0) {
    children.push(heading("Key observations"), ...bullets(report.keyObservations));
  }

  children.push(heading("WWW commitments"), ...wwwSection(report));
  children.push(heading("Recurring blockers"), ...recurringSection(report));
  children.push(...noStuckSection(report));

  if (report.recommendations.length > 0) {
    children.push(heading("Recommendations"), ...bullets(report.recommendations));
  }

  return new Document({
    creator: options.orgName ?? "QuikScale",
    title: `Monthly Report — ${report.clientName} — ${report.periodLabel}`,
    sections: [
      {
        properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
        children,
      },
    ],
  });
}
