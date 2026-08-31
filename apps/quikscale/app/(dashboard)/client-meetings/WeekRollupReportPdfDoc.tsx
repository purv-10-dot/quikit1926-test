/**
 * Week Rollup — downloadable PDF (react-pdf).
 *
 * Mirrors `lib/exports/weekRollupReportDocx.ts` section for section. The rollup
 * reads only STORED reports, so every figure here came from a document that was
 * already generated and, where relevant, signed off — nothing is recomputed at
 * export time.
 *
 * Renders in the browser and on the server; no `"use client"` (see
 * `reportPdfKit.tsx`).
 */
import { Document, Text } from "@react-pdf/renderer";

import type { StoredWeekRollupReport } from "@/lib/reports/weekRollupCompose";
import {
  Bullets,
  DataTable,
  DetailsTable,
  ReportPage,
  SectionTitle,
  Tiles,
  dash,
  humanize,
  metricLabel,
  num,
  pct,
  pdfStyles,
} from "./reportPdfKit";

type Blocker = StoredWeekRollupReport["blockers"][number];
type Trend = StoredWeekRollupReport["trends"][number];
type Source = StoredWeekRollupReport["sources"][number];

const DIRECTION_COLOR: Record<string, string> = {
  IMPROVING: "#166534",
  DECLINING: "#B91C1C",
  STABLE: "#334155",
  VOLATILE: "#B45309",
  INSUFFICIENT_DATA: "#94A3B8",
};

export default function WeekRollupReportPdfDoc({
  report,
  orgName,
  validated = false,
}: {
  report: StoredWeekRollupReport;
  orgName: string;
  validated?: boolean;
}) {
  const title = "Week Rollup";
  const subtitle = `${report.clientName} — ${report.label}`;
  const w = report.www;

  return (
    <Document creator={orgName || "QuikScale"} title={`${title} — ${subtitle}`}>
      <ReportPage
        orgName={orgName}
        title={title}
        subtitle={subtitle}
        validated={validated}
        footerLabel={`${title} · ${subtitle}`}
      >
        <SectionTitle>Coverage</SectionTitle>
        <DetailsTable
          rows={[
            ["Daily Huddle weekly report", report.coverage.dhWeekly ? "Included" : "Missing"],
            ["Weekly meetings included", num(report.coverage.weeklyMeetings)],
            ["Complete", report.coverage.complete ? "Yes" : "No"],
            ["Confidence", pct(report.overallConfidence * 100)],
          ]}
        />
        {report.coverage.missingSources.length > 0 ? (
          <Text style={pdfStyles.warn}>
            Missing sources: {report.coverage.missingSources.join(", ")}
          </Text>
        ) : null}
        {report.coverage.notes.length > 0 ? <Bullets items={report.coverage.notes} /> : null}

        <DataTable<Source>
          rows={report.sources}
          emptyNote="No source reports were rolled up for this week."
          columns={[
            { header: "Source", flex: 2.6, cell: (r) => r.label },
            { header: "Kind", width: 90, cell: (r) => humanize(r.kind) },
            { header: "Date", width: 70, cell: (r) => r.date },
          ]}
        />

        {report.weekSummary ? (
          <>
            <SectionTitle>The week</SectionTitle>
            <Text style={pdfStyles.body}>{report.weekSummary}</Text>
          </>
        ) : null}

        <SectionTitle>Blockers across the week</SectionTitle>
        <DataTable<Blocker>
          rows={report.blockers}
          emptyNote="No blockers were raised in any meeting this week."
          columns={[
            { header: "Blocker", flex: 3, cell: (r) => r.description },
            { header: "Seen", width: 40, align: "center", cell: (r) => num(r.occurrences) },
            { header: "Meetings", width: 52, align: "center", cell: (r) => num(r.meetingsSeen) },
            { header: "Raised by", flex: 1.4, cell: (r) => (r.raisedBy.length ? r.raisedBy.join(", ") : "—") },
            {
              header: "Latest status",
              flex: 1.4,
              // The status a person actually stated — never inferred from age.
              cell: (r) => dash(r.latestStatusStated),
            },
          ]}
        />
        {report.blockers.some((b) => b.crossRhythm) ? (
          <Text style={pdfStyles.note}>
            Some blockers appeared in both the huddles and the weekly meeting.
          </Text>
        ) : null}
        {report.blockerObservation ? (
          <Text style={pdfStyles.note}>{report.blockerObservation}</Text>
        ) : null}

        <SectionTitle>Week over week</SectionTitle>
        <DataTable<Trend>
          rows={report.trends}
          emptyNote="Not enough history yet to compare weeks."
          columns={[
            { header: "Measure", flex: 2.2, cell: (r) => metricLabel(r.metric) },
            {
              header: "Direction",
              width: 78,
              cell: (r) => humanize(r.direction),
              color: (r) => DIRECTION_COLOR[r.direction],
            },
            { header: "First", width: 44, align: "center", cell: (r) => num(r.first) },
            { header: "Last", width: 44, align: "center", cell: (r) => num(r.last) },
            {
              header: "Change",
              width: 56,
              align: "center",
              cell: (r) => (r.delta === null ? "—" : `${r.delta > 0 ? "+" : ""}${r.delta}`),
            },
          ]}
        />
        {report.materialTrends.length > 0 ? (
          <Bullets items={report.materialTrends} />
        ) : (
          <Text style={pdfStyles.note}>No change this week was large enough to be material.</Text>
        )}

        <SectionTitle>WWW commitments</SectionTitle>
        <Tiles
          tiles={[
            { value: num(w.total), label: "Total" },
            { value: num(w.completed), label: "Completed" },
            { value: num(w.overdue), label: "Overdue" },
            { value: num(w.carriedForward), label: "Carried forward" },
            { value: pct(w.completionRate), label: "Completion" },
          ]}
        />
        <Text style={pdfStyles.note}>
          Cancelled {num(w.cancelled)} · overdue rate {pct(w.overdueRate)} · average days to close{" "}
          {num(w.averageDaysToClose)}
        </Text>
        {report.wwwObservation ? <Text style={pdfStyles.note}>{report.wwwObservation}</Text> : null}

        {report.topics.length > 0 ? (
          <>
            <SectionTitle>Workstreams</SectionTitle>
            <Bullets items={report.topics} />
          </>
        ) : null}
        {report.keyObservations.length > 0 ? (
          <>
            <SectionTitle>Key observations</SectionTitle>
            <Bullets items={report.keyObservations} />
          </>
        ) : null}
        {report.recommendations.length > 0 ? (
          <>
            <SectionTitle>Recommendations</SectionTitle>
            <Bullets items={report.recommendations} />
          </>
        ) : null}
      </ReportPage>
    </Document>
  );
}
