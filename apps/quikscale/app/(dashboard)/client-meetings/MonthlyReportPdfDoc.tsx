/**
 * Monthly Report — downloadable PDF (react-pdf).
 *
 * Mirrors `lib/exports/monthlyReportDocx.ts`. Every number here was computed by
 * the deterministic month builder, not by a model, and a month with unreported
 * weeks says which weeks are missing rather than averaging over the gap.
 *
 * Renders in the browser and on the server; no `"use client"` (see
 * `reportPdfKit.tsx`).
 */
import { Document, Text } from "@react-pdf/renderer";

import type { StoredMonthlyReport } from "@/lib/reports/monthlyCompose";
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

type Trend = StoredMonthlyReport["trends"][number];
type Recurring = StoredMonthlyReport["recurringStucks"][number];
type NoStuck = StoredMonthlyReport["noStuckOutliers"][number];

const DIRECTION_COLOR: Record<string, string> = {
  IMPROVING: "#166534",
  DECLINING: "#B91C1C",
  STABLE: "#334155",
  VOLATILE: "#B45309",
  INSUFFICIENT_DATA: "#94A3B8",
};

export default function MonthlyReportPdfDoc({
  report,
  orgName,
  validated = false,
}: {
  report: StoredMonthlyReport;
  orgName: string;
  validated?: boolean;
}) {
  const title = "Monthly Report";
  const subtitle = `${report.clientName} — ${report.periodLabel}`;
  const c = report.coverage;
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
            ["Weeks in the month", num(c.weeksTotal)],
            ["Weeks with a report", num(c.weeksReported)],
            ["Weekly meetings included", c.weeklyMeetingsIncluded ? "Yes" : "No"],
            ["Confidence", pct(report.overallConfidence * 100)],
          ]}
        />
        {c.missingWeeks.length > 0 ? (
          // Named, not averaged over: a month missing two weeks is a different
          // claim from a month that was quiet.
          <Text style={pdfStyles.warn}>
            No report for {c.missingWeeks.length} week
            {c.missingWeeks.length === 1 ? "" : "s"}: {c.missingWeeks.join(", ")}
          </Text>
        ) : null}
        {!c.weeklyMeetingsIncluded ? (
          <Text style={pdfStyles.warn}>
            Weekly-meeting figures are absent because extraction has not run for them.
          </Text>
        ) : null}

        <SectionTitle>Trends across the month</SectionTitle>
        <DataTable<Trend>
          rows={report.trends}
          emptyNote="Not enough reported weeks to establish a trend."
          columns={[
            { header: "Measure", flex: 2.2, cell: (r) => metricLabel(r.metric) },
            {
              header: "Direction",
              width: 78,
              cell: (r) => humanize(r.direction),
              color: (r) => DIRECTION_COLOR[r.direction],
            },
            { header: "First", width: 42, align: "center", cell: (r) => num(r.first) },
            { header: "Last", width: 42, align: "center", cell: (r) => num(r.last) },
            { header: "Mean", width: 42, align: "center", cell: (r) => num(r.mean) },
            {
              header: "Change",
              width: 54,
              align: "center",
              cell: (r) => (r.delta === null ? "—" : `${r.delta > 0 ? "+" : ""}${r.delta}`),
            },
            { header: "Weeks", width: 42, align: "center", cell: (r) => num(r.observations) },
          ]}
        />
        {report.materialTrends.length > 0 ? (
          <Bullets items={report.materialTrends} />
        ) : (
          <Text style={pdfStyles.note}>
            No movement this month was large enough to be called material.
          </Text>
        )}

        {report.keyObservations.length > 0 ? (
          <>
            <SectionTitle>Key observations</SectionTitle>
            <Bullets items={report.keyObservations} />
          </>
        ) : null}

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
          Cancelled {num(w.cancelled)} · overdue rate {pct(w.overdueRate)} · carry-forward rate{" "}
          {pct(w.carryForwardRate)} · average days to close {num(w.averageDaysToClose)}
        </Text>
        {report.wwwObservation ? <Text style={pdfStyles.note}>{report.wwwObservation}</Text> : null}

        <SectionTitle>Recurring blockers</SectionTitle>
        <DataTable<Recurring>
          rows={report.recurringStucks}
          emptyNote="No blocker recurred across weeks this month."
          columns={[
            { header: "Blocker", flex: 3, cell: (r) => r.description },
            { header: "Seen", width: 40, align: "center", cell: (r) => num(r.occurrences) },
            { header: "Weeks", width: 44, align: "center", cell: (r) => num(r.weeksSeen) },
            {
              header: "Raised by",
              flex: 1.4,
              cell: (r) => (r.raisedBy.length ? r.raisedBy.join(", ") : "—"),
            },
            { header: "Latest status", flex: 1.4, cell: (r) => dash(r.latestStatusStated) },
          ]}
        />

        {report.noStuckOutliers.length > 0 ? (
          <>
            <SectionTitle>Never raised a stuck</SectionTitle>
            <DataTable<NoStuck>
              rows={report.noStuckOutliers}
              emptyNote=""
              columns={[
                { header: "Member", flex: 2, cell: (r) => r.name },
                { header: "No-stuck rate", width: 78, align: "center", cell: (r) => pct(r.noStuckRate) },
                { header: "Huddles", width: 56, align: "center", cell: (r) => num(r.huddlesAttended) },
                {
                  header: "Stuck adherence",
                  width: 86,
                  align: "center",
                  cell: (r) => pct(r.stuckAdherencePct),
                },
              ]}
            />
            <Text style={pdfStyles.note}>
              A high no-stuck rate is a prompt to ask, not a finding in itself.
            </Text>
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
