/**
 * The Weekly Meeting Report as a Word document.
 *
 * Rendered from the STORED report, never from a request body, so a download can
 * only ever contain what was generated. No model is called: exporting costs
 * nothing however many times it happens.
 *
 * ORDER IS AN EDITORIAL DECISION
 * ------------------------------
 * Coverage comes first, before any finding. A reader needs to know the report
 * saw 92% of the meeting BEFORE they read "three gaps were raised" — afterwards
 * it is a footnote nobody revisits, and by then they have already formed the
 * wrong impression of completeness.
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

import type { StoredWmReport } from "@/lib/reports/wmCompose";

const HEADER_FILL = "EFF6FF";
const CAVEAT_FILL = "FEF3C7";
const ALERT_FILL = "FEE2E2";

const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n}%`;

const mins = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${n} min`;

/** Plain words, not colour swatches — a RAG cell must read the same in mono. */
const RAG_LABEL: Record<string, string> = {
  GREEN: "Green",
  AMBER: "Amber",
  RED: "Red",
  UNKNOWN: "Not known",
  NOT_STATED: "Not stated",
  MIXED: "Mixed",
};

const COVERAGE_LABEL: Record<string, string> = {
  DONE: "Done",
  PARTIAL: "Partial",
  NOT_DONE: "Not done",
  UNKNOWN: "Not known",
};

const TIME_LABEL: Record<string, string> = {
  ON_TRACK: "On track",
  RUSHED: "Rushed",
  OVER_RAN: "Over-ran",
  SKIPPED: "Skipped",
  UNKNOWN: "Not known",
};

const STATE_LABEL: Record<string, string> = {
  PRESENT: "Present",
  PARTIAL: "Part",
  ABSENT: "Absent",
  NA: "N/A",
  UNKNOWN: "Not known",
};

const label = (map: Record<string, string>, key: string) => map[key] ?? key;

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

function note(value: string) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [text(value, { color: "6B7280" })],
  });
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

/** "Nothing here" is a finding; an empty table is a bug the reader has to guess about. */
function emptyNote(value: string) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [text(value, { color: "6B7280" })],
  });
}

/**
 * Coverage — stated first, on purpose.
 *
 * A PARTIAL report names the exact windows nobody read, in the same units the
 * recording uses, so a facilitator can go and listen to them.
 */
function coverageSection(report: StoredWmReport): (Paragraph | Table)[] {
  const c = report.coverage;

  if (!c.extractionRan) {
    return [
      new Paragraph({
        shading: { fill: CAVEAT_FILL },
        spacing: { after: 120 },
        children: [
          text(
            "No transcript was processed for this meeting. This report covers the facilitator's record only — attendance, agenda flags and times.",
            { bold: true },
          ),
        ],
      }),
    ];
  }

  if (c.completeness === "COMPLETE") {
    return [note(`Full coverage of the recording (${pct(c.coveragePct)}).`)];
  }

  const out: (Paragraph | Table)[] = [
    new Paragraph({
      shading: { fill: ALERT_FILL },
      spacing: { after: 120 },
      children: [
        text(
          `INCOMPLETE — ${pct(c.coveragePct)} of the recording was processed. This report cannot be signed off.`,
          { bold: true },
        ),
      ],
    }),
  ];

  if (c.missingWindows.length > 0) {
    out.push(note("Content in these windows was not read:"));
    out.push(...bullets(c.missingWindows.map((w) => w.label)));
  }
  if (c.incompleteSections.length > 0) {
    out.push(
      note(
        `Sections drawing on those windows are incomplete: ${c.incompleteSections.join(", ")}.`,
      ),
    );
  }
  return out;
}

/** Section 1 — attendance. */
function attendanceSection(report: StoredWmReport): (Paragraph | Table)[] {
  const a = report.attendance;
  const rows = [headerRow(["Member", "Role", "Type", "Attendance", "Evidence"])];

  for (const r of a.rows) {
    rows.push(
      new TableRow({
        children: [
          cell(r.name, { width: 30 }),
          cell(r.role ?? "—", { width: 22 }),
          cell(r.attendanceType, { width: 14 }),
          cell(label(STATE_LABEL, r.state), { width: 14 }),
          cell(r.evidence.toLowerCase().replace(/_/g, " "), { width: 20 }),
        ],
      }),
    );
  }

  const summary: string[] = [
    `${a.present} present · ${a.absent} absent · ${a.expected} expected · ${pct(a.attendancePct)}`,
  ];
  // Named separately because both are EXCLUDED from the rate. A reader who sees
  // 84% needs to know who was never counted, in either direction.
  if (a.onLeave) summary.push(`${a.onLeave} on approved leave (not counted)`);
  if (a.unknown) summary.push(`${a.unknown} with no attendance evidence (not counted)`);

  return [note(summary.join(" · ")), table(rows)];
}

/** Section 2 — agenda coverage, expected vs actual (§5.2). */
function agendaSection(report: StoredWmReport): (Paragraph | Table)[] {
  const rows = [
    headerRow(["Segment", "Covered", "Time", "Expected", "Actual", "Window", "Comment"]),
  ];

  for (const r of report.agenda.rows) {
    rows.push(
      new TableRow({
        children: [
          cell(r.label, { width: 22 }),
          cell(label(COVERAGE_LABEL, r.coverage), { width: 11 }),
          cell(label(TIME_LABEL, r.timeDiscipline), { width: 11 }),
          cell(mins(r.expectedMinutes), { width: 11 }),
          cell(mins(r.actualMinutes), { width: 11 }),
          cell(r.window ?? "—", { width: 14 }),
          cell(r.comment ?? "—", { width: 20 }),
        ],
      }),
    );
  }

  const out: (Paragraph | Table)[] = [table(rows)];

  const disagreements = report.agenda.rows.filter((r) => r.flagDisagrees);
  if (disagreements.length > 0) {
    // Recorded rather than resolved: the facilitator's flag stands, but a
    // systematic mismatch means either the detection or the form-filling is
    // wrong, and both are worth knowing.
    out.push(
      note(
        `The facilitator's flag differs from the recording for: ${disagreements
          .map((r) => r.label)
          .join(", ")}. The facilitator's flag is authoritative.`,
      ),
    );
  }
  if (report.agenda.observation) out.push(note(report.agenda.observation));
  return out;
}

/** Section 3 — the K&P dashboard grid. */
function kpSection(report: StoredWmReport): (Paragraph | Table)[] {
  const k = report.kpDashboard;
  if (k.rows.length === 0) {
    return [emptyNote("No dashboard reads were captured for this meeting.")];
  }

  const rows = [headerRow(["Member", "KPIs", "Priorities", "Key points"])];
  for (const r of k.rows) {
    rows.push(
      new TableRow({
        children: [
          cell(r.notApplicable ? `${r.name} (N/A this week)` : r.name, { width: 24 }),
          cell(label(RAG_LABEL, r.kpiRag) + (r.ragConflict ? " *" : ""), { width: 13 }),
          cell(label(RAG_LABEL, r.priorityRag), { width: 13 }),
          cell(r.keyPoints.join("; ") || "—", { width: 50 }),
        ],
      }),
    );
  }

  const out: (Paragraph | Table)[] = [
    note(`${k.reviewed} of ${k.expected} dashboards reviewed. Statuses are as stated in the meeting.`),
    table(rows),
  ];

  if (k.rows.some((r) => r.ragConflict)) {
    out.push(
      note(
        "* Status was stated differently at two points in the meeting. Both readings are kept; neither was chosen.",
      ),
    );
  }
  return out;
}

/** Section 4 — gaps and what was agreed about them. */
function gapsSection(report: StoredWmReport): (Paragraph | Table)[] {
  const g = report.gaps;
  if (g.rows.length === 0) return [emptyNote("No gaps were surfaced in this meeting.")];

  const rows = [headerRow(["Gap", "Scope", "Raised by", "Agreed action"])];
  for (const r of g.rows) {
    rows.push(
      new TableRow({
        children: [
          cell(r.gap, { width: 38 }),
          cell(r.scope === "TEAM" ? "Team-wide" : "Individual", { width: 12 }),
          cell(r.raisedBy.join(", ") || "—", { width: 20 }),
          cell(r.agreedAction ?? "No action agreed", { width: 30 }),
        ],
      }),
    );
  }

  const out: (Paragraph | Table)[] = [table(rows)];
  if (g.withoutAction > 0) {
    out.push(
      note(
        `${g.withoutAction} of ${g.rows.length} gaps left the meeting without an agreed action.`,
      ),
    );
  }
  if (g.observation) out.push(note(g.observation));
  return out;
}

/** Sections 5 and 6 — the WWW pair. */
function wwwSections(report: StoredWmReport): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [heading("WWW review")];

  if (!report.wwwReview.available) {
    out.push(
      emptyNote(
        report.wwwReview.unavailableReason ?? "This section could not be generated.",
      ),
    );
  } else if (report.wwwReview.rows.length === 0) {
    out.push(emptyNote("No open commitments were in scope for this meeting."));
  } else {
    const rows = [headerRow(["What", "Owner", "Due", "Status", "Note"])];
    for (const raw of report.wwwReview.rows) {
      const r = raw as Record<string, unknown>;
      rows.push(
        new TableRow({
          children: [
            cell(String(r.what ?? "—"), { width: 36 }),
            cell(String(r.who ?? "—"), { width: 18 }),
            cell(formatDate(r.when), { width: 14 }),
            cell(String(r.status ?? "—"), { width: 16 }),
            cell(
              // The single most useful line the section can carry: the record
              // and the meeting disagreeing about whether something is done.
              r.closureDisputed
                ? "Closure claimed in the meeting; the record still shows it open"
                : String(r.lifecycle ?? "—"),
              { width: 16 },
            ),
          ],
        }),
      );
    }
    out.push(table(rows));
  }

  if (report.wwwReview.scopeLimited) {
    out.push(
      note(
        "This list shows only the commitments you have permission to see, so it may not be the full picture.",
      ),
    );
  }

  out.push(heading("New WWW captured"));

  if (!report.newWww.available) {
    out.push(
      emptyNote(report.newWww.unavailableReason ?? "This section could not be generated."),
    );
    return out;
  }
  if (report.newWww.rows.length === 0) {
    out.push(emptyNote("No new commitments were captured in this meeting."));
    return out;
  }

  const rows = [headerRow(["What", "Owner", "When", "Still needed"])];
  for (const raw of report.newWww.rows) {
    const r = raw as Record<string, unknown>;
    const missing = Array.isArray(r.missingFields) ? (r.missingFields as string[]) : [];
    rows.push(
      new TableRow({
        children: [
          cell(String(r.what ?? "—"), { width: 40 }),
          cell(String(r.whoRaw ?? "—"), { width: 20 }),
          // Never a guessed date. "Not specified" is the honest rendering of a
          // commitment made without one, and is itself the finding.
          cell(r.whenMissing ? "Not specified" : String(r.whenText ?? "—"), { width: 20 }),
          cell(missing.length ? missing.join(", ") : "ready to create", { width: 20 }),
        ],
      }),
    );
  }
  out.push(table(rows));
  return out;
}

/** Section 7 — good news, feedback and collective intelligence. */
function discussionSections(report: StoredWmReport): (Paragraph | Table)[] {
  const d = report.discussions;
  const out: (Paragraph | Table)[] = [];

  const block = (title: string, items: Array<Record<string, unknown>>) => {
    out.push(heading(title));
    if (items.length === 0) {
      out.push(emptyNote("Nothing was recorded for this segment."));
      return;
    }
    out.push(
      ...items.map(
        (i) =>
          new Paragraph({
            bullet: { level: 0 },
            spacing: { before: 40, after: 40 },
            children: [
              text(
                `${i.sharedBy ? `${String(i.sharedBy)}: ` : ""}${String(i.summary ?? "")}` +
                  (i.outcome ? ` — ${String(i.outcome)}` : ""),
              ),
            ],
          }),
      ),
    );
  };

  block("Good news", d.goodNews);
  block("Customer feedback", d.customerFeedback);
  block("Employee feedback", d.employeeFeedback);
  block("Collective intelligence", d.collectiveIntelligence);

  if (d.deferred.length > 0) {
    // A deferred segment is a fact worth recording. Manufacturing content for
    // it from elsewhere in the meeting is the failure this line prevents.
    out.push(note(`Deferred in this meeting: ${d.deferred.join("; ")}`));
  }
  return out;
}

/** Section 8 — the ten-metric scorecard. */
function scorecardSection(report: StoredWmReport): (Paragraph | Table)[] {
  const rows = [headerRow(["#", "Metric", "Reading", "Status"])];

  for (const m of report.scorecard.metrics) {
    rows.push(
      new TableRow({
        children: [
          cell(String(m.n), { width: 6, align: AlignmentType.CENTER }),
          cell(m.derivedProxy ? `${m.label} (indirect measure)` : m.label, { width: 40 }),
          cell(m.reading, { width: 36 }),
          cell(label(RAG_LABEL, m.rag), { width: 18 }),
        ],
      }),
    );
  }

  rows.push(
    new TableRow({
      children: [
        cell("", { width: 6, fill: HEADER_FILL }),
        cell("Overall", { width: 40, bold: true, fill: HEADER_FILL }),
        cell(report.scorecard.overall.reading, { width: 36, bold: true, fill: HEADER_FILL }),
        cell(label(RAG_LABEL, report.scorecard.overall.rag), {
          width: 18,
          bold: true,
          fill: HEADER_FILL,
        }),
      ],
    }),
  );

  return [table(rows)];
}

function formatDate(value: unknown): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 10);
}

/** Build the Word document for a stored Weekly Meeting Report. */
export function buildWeeklyMeetingReportDocx(
  report: StoredWmReport,
  options: { orgName?: string | null; validated?: boolean } = {},
): Document {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [text("Weekly Meeting Report", { bold: true, size: 34 })],
    }),
    new Paragraph({
      spacing: { after: 40 },
      children: [text(`${report.clientName} — ${report.meetingDate}`, { size: 24 })],
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

  // An unreviewed report says so on its face, so a draft cannot be circulated
  // as if it were final.
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

  if (!report.callHeld) {
    // Nothing below would mean anything. Rendering empty sections for a meeting
    // that never happened invites the reader to interpret them.
    children.push(
      new Paragraph({
        shading: { fill: ALERT_FILL },
        spacing: { before: 160, after: 160 },
        children: [
          text(`This meeting did not take place (${report.callStatus}).`, { bold: true }),
        ],
      }),
    );
    return finish(children, report, options);
  }

  if (report.meetingSummary) {
    children.push(heading("Summary"), new Paragraph({ children: [text(report.meetingSummary)] }));
  }

  children.push(heading("Attendance"), ...attendanceSection(report));
  children.push(heading("Agenda coverage"), ...agendaSection(report));
  children.push(heading("K&P dashboard"), ...kpSection(report));
  children.push(heading("Gaps"), ...gapsSection(report));
  children.push(...wwwSections(report));
  children.push(...discussionSections(report));
  children.push(heading("Meeting scorecard"), ...scorecardSection(report));

  if (report.keyObservations.length > 0) {
    children.push(heading("Key observations"), ...bullets(report.keyObservations));
  }
  if (report.recommendations.length > 0) {
    children.push(heading("Recommendations"), ...bullets(report.recommendations));
  }

  return finish(children, report, options);
}

function finish(
  children: (Paragraph | Table)[],
  report: StoredWmReport,
  options: { orgName?: string | null },
): Document {
  return new Document({
    creator: options.orgName ?? "QuikScale",
    title: `Weekly Meeting Report — ${report.clientName} — ${report.meetingDate}`,
    sections: [
      {
        properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
        children,
      },
    ],
  });
}
