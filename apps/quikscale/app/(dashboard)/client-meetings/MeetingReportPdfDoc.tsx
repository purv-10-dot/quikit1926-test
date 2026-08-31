/**
 * Meeting Report — downloadable PDF (react-pdf).
 *
 * The per-transcript report shown under Transcripts → Report, for every cadence
 * EXCEPT Daily Huddle. A Daily Huddle has its own five-section adherence
 * deliverable and its own document (`DailyAdherencePdfDoc`); this one covers
 * the Weekly Meeting and the general case, whose content is narrative sections
 * with a facilitator's assessment, an optional scorecard, and the KPI /
 * Priority / WWW candidates the transcript implied.
 *
 * Section order mirrors `MeetingReportPanel` exactly, so the download and the
 * screen are the same document in two media. Where the screen shows a
 * confidence bar, the PDF prints the percentage — a reader who cannot see the
 * bar must still be told how strongly the transcript supported each item.
 *
 * Built with `reportPdfKit`, like every other report PDF, so headers, tables
 * and RAG colours match across the downloads. No `"use client"`: see
 * `reportPdfKit.tsx`.
 */
import { Document, Text, View } from "@react-pdf/renderer";

import type { StoredMeetingReport } from "@/lib/ai/meetingReport";
// `Column` is an interface, so it MUST come through `import type`. The repo
// compiles with `isolatedModules`, where each file is transpiled without type
// information: a type pulled in on a value import survives into the emitted
// module, the browser bundle then asks `reportPdfKit` for a runtime export that
// does not exist, and the module throws before a single page renders. Node and
// Vitest elide it, so this fails ONLY in the browser — which is exactly how it
// got past a green test run once already. `pdfWinAnsiGlyphs.test.ts` now guards
// the whole class.
import type { Column } from "./reportPdfKit";
import {
  DataTable,
  DetailsTable,
  RAG_COLOR,
  ReportPage,
  SectionTitle,
  dash,
  pdfStyles,
  winAnsi,
} from "./reportPdfKit";

type AdherenceRow = NonNullable<StoredMeetingReport["adherence"]>[number];
type ScoreRow = NonNullable<StoredMeetingReport["scorecard"]>[number];

/** The shape the three extracted groups share once flattened for one table. */
interface ItemRow {
  label: string;
  detail: string;
  confidence: number;
  /** The existing record this duplicates, when the tagger found one. */
  duplicate: string;
}

const asPct = (n: number | null | undefined): string =>
  typeof n === "number" && Number.isFinite(n) ? `${Math.round(n * 100)}%` : "-";

/**
 * Confidence, coloured on the same thresholds as the on-screen bar
 * (`confColor` in `MeetingReportPanel`). A number the reader can only compare
 * against other numbers is worth less than one that carries its own verdict.
 */
const confidenceColor = (c: number): string =>
  c >= 0.7 ? "#15803D" : c >= 0.4 ? "#B45309" : "#B91C1C";

const ITEM_COLUMNS: Column<ItemRow>[] = [
  { header: "Item", flex: 3, cell: (r) => r.label },
  { header: "Detail", flex: 3, cell: (r) => r.detail },
  { header: "Already exists", width: 96, cell: (r) => r.duplicate },
  {
    header: "Confidence",
    width: 54,
    align: "center",
    cell: (r) => asPct(r.confidence),
    color: (r) => confidenceColor(r.confidence),
  },
];

/**
 * One extracted group.
 *
 * `emptyNote` distinguishes the two reasons a group is empty, because they mean
 * opposite things to a reader: the model found nothing to extract, versus the
 * cadence does not extract this kind of thing at all.
 */
function ExtractedGroup({
  title,
  rows,
  emptyNote,
}: {
  title: string;
  rows: ItemRow[];
  emptyNote: string;
}) {
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <DataTable columns={ITEM_COLUMNS} rows={rows} emptyNote={emptyNote} />
    </>
  );
}

const duplicateLabel = (d: { name?: string | null } | null | undefined): string =>
  d?.name ? d.name : "-";

/** Join the parts of a detail cell, collapsing an all-empty result to a dash. */
const detail = (parts: (string | null | undefined)[]): string =>
  parts.filter(Boolean).join("  -  ") || "-";

export default function MeetingReportPdfDoc({
  report,
  orgName,
  clientName,
}: {
  report: StoredMeetingReport;
  orgName: string;
  /** Falls back to the report's own meta when the caller has no better name. */
  clientName?: string | null;
}) {
  const meta = report.meta;
  const client = clientName ?? meta?.client ?? null;
  const dateLabel = meta?.date ?? null;
  const adherence: AdherenceRow[] = report.adherence ?? [];
  const scorecard: ScoreRow[] = report.scorecard ?? [];

  const title = report.reportType === "WEEKLY" ? "Weekly Meeting Report" : "Meeting Report";
  const subtitle = [client, dateLabel].filter(Boolean).join("  -  ") || null;

  const details: [string, string][] = [
    ["Meeting", dash(report.title)],
    ["Client", dash(client)],
    ["Date", dash(dateLabel)],
    ["Duration", meta?.durationMinutes != null ? `${meta.durationMinutes} min` : "-"],
    ["Platform", dash(meta?.platform)],
    ["Overall confidence", asPct(report.overallConfidence)],
  ];
  // Attendees can run long, so they get their own row rather than a cell that
  // would push the table off the page.
  const attendees = (meta?.attendees ?? []).filter(Boolean);
  if (attendees.length) details.push(["Attendees", attendees.join(", ")]);

  const kpis: ItemRow[] = report.extractedItems.kpis.map((k) => ({
    label: k.name,
    detail: detail([
      k.description,
      k.measurementUnit,
      k.target != null ? `target ${k.target}` : null,
    ]),
    confidence: k.confidence,
    duplicate: duplicateLabel(k.duplicate),
  }));

  const priorities: ItemRow[] = report.extractedItems.priorities.map((p) => ({
    label: p.name,
    detail: detail([p.owner ? `Owner: ${p.owner}` : null, p.description]),
    confidence: p.confidence,
    duplicate: duplicateLabel(p.duplicate),
  }));

  const wwws: ItemRow[] = report.extractedItems.wwws.map((w) => ({
    label: w.what,
    detail: detail([w.who ? `Who: ${w.who}` : null, w.when ? `By: ${w.when}` : null]),
    confidence: w.confidence,
    duplicate: duplicateLabel(w.duplicate),
  }));

  // A Daily Huddle never creates a KPI or a Priority — the decision belongs to
  // the Weekly Meeting — so for that cadence the empty tables are the rule, not
  // a gap, and those sections are dropped rather than printed empty.
  const daily = report.reportType === "DAILY";

  return (
    <Document>
      <ReportPage
        orgName={orgName || "QuikScale"}
        title={title}
        subtitle={subtitle}
        /* This report has no sign-off step, so it is never stamped as reviewed
           the way the Weekly Meeting Report is. Passing `true` avoids claiming
           a review workflow that does not exist for it. */
        validated
        footerLabel={`${title}${client ? ` - ${client}` : ""}`}
      >
        <SectionTitle>Meeting details</SectionTitle>
        <DetailsTable rows={details} />

        {report.summary ? (
          <>
            <SectionTitle>Summary</SectionTitle>
            <Text style={pdfStyles.body}>{winAnsi(report.summary)}</Text>
          </>
        ) : null}

        {report.sections.map((s, i) => (
          <View key={i} wrap={false}>
            <SectionTitle>{s.heading}</SectionTitle>
            <Text style={pdfStyles.body}>{winAnsi(s.body)}</Text>
            {/* The facilitator's assessment is italic on screen and italic
                here — it is a judgement, not a record of what was said. */}
            {s.assessment ? <Text style={pdfStyles.note}>{winAnsi(s.assessment)}</Text> : null}
          </View>
        ))}

        {adherence.length ? (
          <>
            <SectionTitle>Adherence</SectionTitle>
            <DataTable<AdherenceRow>
              columns={[
                {
                  header: "Participant",
                  flex: 2,
                  cell: (r) => (r.role ? `${r.participant} (${r.role})` : r.participant),
                },
                { header: "Achievement", width: 62, align: "center", cell: (r) => dash(r.achievement) },
                { header: "Focus", width: 50, align: "center", cell: (r) => dash(r.focus) },
                { header: "Stuck", width: 50, align: "center", cell: (r) => dash(r.stuck) },
                { header: "Score", width: 40, align: "center", cell: (r) => dash(r.score) },
                { header: "Rating", width: 50, align: "center", cell: (r) => dash(r.rating) },
              ]}
              rows={adherence}
              emptyNote="No participant adherence was recorded for this meeting."
            />
          </>
        ) : null}

        {scorecard.length ? (
          <>
            <SectionTitle>Scorecard</SectionTitle>
            <DataTable<ScoreRow>
              columns={[
                { header: "Metric", flex: 2, cell: (r) => r.metric },
                { header: "Reading", flex: 3, cell: (r) => r.reading },
                {
                  header: "RAG",
                  width: 54,
                  align: "center",
                  cell: (r) => dash(r.rag),
                  color: (r) => (r.rag ? RAG_COLOR[r.rag] : undefined),
                },
              ]}
              rows={scorecard}
              emptyNote="No scorecard was produced for this meeting."
            />
          </>
        ) : null}

        {daily ? null : (
          <>
            <ExtractedGroup
              title="KPIs identified"
              rows={kpis}
              emptyNote="The transcript did not support any new KPI."
            />
            <ExtractedGroup
              title="Priorities identified"
              rows={priorities}
              emptyNote="The transcript did not support any new Priority."
            />
          </>
        )}
        <ExtractedGroup
          title="WWW action items"
          rows={wwws}
          emptyNote="No action items were captured from this meeting."
        />
      </ReportPage>
    </Document>
  );
}
