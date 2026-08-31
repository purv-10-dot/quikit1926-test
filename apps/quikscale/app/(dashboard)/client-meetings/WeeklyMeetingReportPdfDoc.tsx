/**
 * Weekly Meeting Report — downloadable PDF (react-pdf).
 *
 * Mirrors the section order of `lib/exports/weeklyMeetingReportDocx.ts`, so the
 * Word and PDF downloads of one report are the same document in two formats.
 * When a section is bounded or a source was never read, this says so in place of
 * the table — the docx does the same, and a reader must never have to guess
 * whether an empty section means "nothing happened" or "nothing was recorded".
 *
 * Renders in the browser (a panel's `.pdf` button) and on the server (the bulk
 * export). No `"use client"`: see `reportPdfKit.tsx`.
 */
import { Document, Text, View } from "@react-pdf/renderer";

import type { StoredWmReport } from "@/lib/reports/wmCompose";
import {
  Bullets,
  DataTable,
  DetailsTable,
  RAG_COLOR,
  ReportPage,
  SectionTitle,
  Tiles,
  dash,
  humanize,
  num,
  pct,
  pdfStyles,
  str,
} from "./reportPdfKit";

type AttendanceRow = StoredWmReport["attendance"]["rows"][number];
type AgendaRow = StoredWmReport["agenda"]["rows"][number];
type KpRow = StoredWmReport["kpDashboard"]["rows"][number];
type GapRow = StoredWmReport["gaps"]["rows"][number];
type ScoreRow = StoredWmReport["scorecard"]["metrics"][number];

/** A WWW row is stored as opaque JSON by its owning service — read defensively. */
const wwwCells = (row: Record<string, unknown>) => ({
  what: str(row.what) || str(row.title) || str(row.description) || "—",
  who: str(row.who) || str(row.owner) || str(row.ownerName) || "—",
  when: str(row.when) || str(row.dueDate).slice(0, 10) || "—",
  status: humanize(str(row.status) || str(row.state)),
});

function WwwSection({
  title,
  section,
}: {
  title: string;
  section: StoredWmReport["wwwReview"];
}) {
  return (
    <View>
      <SectionTitle>{title}</SectionTitle>
      {!section.available ? (
        <Text style={pdfStyles.note}>{dash(section.unavailableReason)}</Text>
      ) : (
        <>
          <DataTable<Record<string, unknown>>
            rows={section.rows}
            emptyNote="No commitments recorded for this meeting."
            columns={[
              { header: "What", flex: 3, cell: (r) => wwwCells(r).what },
              { header: "Who", flex: 1.2, cell: (r) => wwwCells(r).who },
              { header: "When", width: 60, cell: (r) => wwwCells(r).when },
              { header: "Status", width: 70, cell: (r) => wwwCells(r).status },
            ]}
          />
          {section.scopeLimited ? (
            <Text style={pdfStyles.warn}>
              Scope-limited: this list shows only the commitments you may see.
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

/** Discussion buckets are opaque JSON too; pull the most likely text field. */
const discussionLines = (rows: Record<string, unknown>[]): string[] =>
  rows
    .map((r) => str(r.text) || str(r.summary) || str(r.what) || str(r.description))
    .filter((s) => s.trim().length > 0);

export default function WeeklyMeetingReportPdfDoc({
  report,
  orgName,
  validated = false,
}: {
  report: StoredWmReport;
  orgName: string;
  validated?: boolean;
}) {
  const title = "Weekly Meeting Report";
  const subtitle = `${report.clientName} — ${report.meetingDate}`;
  const a = report.attendance;
  const discussions: [string, Record<string, unknown>[]][] = [
    ["Good news", report.discussions.goodNews],
    ["Customer feedback", report.discussions.customerFeedback],
    ["Employee feedback", report.discussions.employeeFeedback],
    ["Collective intelligence", report.discussions.collectiveIntelligence],
  ];

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
            ["Completeness", humanize(report.coverage.completeness)],
            ["Transcript coverage", pct(report.coverage.coveragePct)],
            ["Extraction ran", report.coverage.extractionRan ? "Yes" : "No"],
            ["Confidence", pct(report.overallConfidence * 100)],
          ]}
        />
        {report.coverage.missingWindows.length > 0 ? (
          <Text style={pdfStyles.warn}>
            Unread windows: {report.coverage.missingWindows.map((w) => w.label).join(", ")}
          </Text>
        ) : null}
        {report.coverage.incompleteSections.length > 0 ? (
          <Text style={pdfStyles.warn}>
            Incomplete sections: {report.coverage.incompleteSections.join(", ")}
          </Text>
        ) : null}

        {/*
          What the report had no room to PRINT, which is a different statement
          from what nobody READ. Conflating the two would tell a facilitator a
          recording gap exists when there is none.
        */}
        {!report.reduction.complete ? (
          <>
            <Text style={pdfStyles.warn}>
              Some recorded detail is not printed below (bounded sections):
            </Text>
            <Bullets
              items={report.reduction.omitted.map(
                (o) =>
                  `${humanize(o.factType)}${o.topicKey ? ` · ${o.topicKey}` : ""}: ${o.dropped} of ${o.total} not shown — ${o.reason}`,
              )}
            />
          </>
        ) : null}

        {!report.callHeld ? (
          <Text style={pdfStyles.alert}>
            This meeting did not take place ({humanize(report.callStatus)}).
          </Text>
        ) : (
          <>
            {report.meetingSummary ? (
              <>
                <SectionTitle>Summary</SectionTitle>
                <Text style={pdfStyles.body}>{report.meetingSummary}</Text>
              </>
            ) : null}

            <SectionTitle>Attendance</SectionTitle>
            <Tiles
              tiles={[
                { value: num(a.present), label: "Present" },
                { value: num(a.absent), label: "Absent" },
                { value: num(a.onLeave), label: "On leave" },
                { value: num(a.unknown), label: "No evidence" },
                { value: pct(a.attendancePct), label: `Of ${a.expected} expected` },
              ]}
            />
            <DataTable<AttendanceRow>
              rows={a.rows}
              emptyNote="No roster was recorded for this meeting."
              columns={[
                { header: "Member", flex: 2, cell: (r) => r.name },
                { header: "Role", flex: 1.4, cell: (r) => dash(r.role) },
                { header: "Type", width: 60, cell: (r) => humanize(r.attendanceType) },
                { header: "State", width: 60, align: "center", cell: (r) => humanize(r.state) },
                { header: "Evidence", flex: 1.4, cell: (r) => humanize(r.evidence) },
              ]}
            />
            <Text style={pdfStyles.note}>
              A member with no evidence either way is left unscored rather than assumed absent.
            </Text>

            <SectionTitle>Agenda coverage</SectionTitle>
            <DataTable<AgendaRow>
              rows={[...report.agenda.rows].sort((x, y) => x.order - y.order)}
              emptyNote="No agenda was configured for this client."
              columns={[
                { header: "Segment", flex: 2.2, cell: (r) => r.label },
                { header: "Coverage", width: 70, cell: (r) => humanize(r.coverage) },
                { header: "Time", width: 70, cell: (r) => humanize(r.timeDiscipline) },
                { header: "Planned", width: 46, align: "center", cell: (r) => `${r.expectedMinutes}m` },
                {
                  header: "Actual",
                  width: 46,
                  align: "center",
                  cell: (r) => (r.actualMinutes === null ? "—" : `${r.actualMinutes}m`),
                },
              ]}
            />
            {report.agenda.observation ? (
              <Text style={pdfStyles.note}>{report.agenda.observation}</Text>
            ) : null}

            <SectionTitle>K&amp;P dashboard</SectionTitle>
            <DataTable<KpRow>
              rows={report.kpDashboard.rows}
              emptyNote="No KPI or Priority review was recorded."
              columns={[
                { header: "Member", flex: 1.8, cell: (r) => r.name },
                {
                  header: "KPI",
                  width: 56,
                  align: "center",
                  cell: (r) => (r.notApplicable ? "N/A" : humanize(r.kpiRag)),
                  color: (r) => RAG_COLOR[r.kpiRag],
                },
                {
                  header: "Priority",
                  width: 60,
                  align: "center",
                  cell: (r) => (r.notApplicable ? "N/A" : humanize(r.priorityRag)),
                  color: (r) => RAG_COLOR[r.priorityRag],
                },
                {
                  header: "Key points",
                  flex: 3,
                  cell: (r) =>
                    r.keyPoints.length > 0
                      ? r.keyPoints.join("; ") + (r.ragConflict ? "  [RAG conflict]" : "")
                      : r.ragConflict
                        ? "[RAG conflict]"
                        : "—",
                },
              ]}
            />
            <Text style={pdfStyles.note}>
              Reviewed {report.kpDashboard.reviewed} of {report.kpDashboard.expected}. A RAG value
              stated in the meeting is recorded verbatim, never re-judged.
            </Text>

            <SectionTitle>Gaps</SectionTitle>
            <DataTable<GapRow>
              rows={report.gaps.rows}
              emptyNote="No gaps were raised."
              columns={[
                { header: "Gap", flex: 3, cell: (r) => r.gap },
                { header: "Agreed action", flex: 2.2, cell: (r) => dash(r.agreedAction) },
                { header: "Owner", flex: 1.2, cell: (r) => dash(r.owner) },
                { header: "Scope", width: 66, cell: (r) => humanize(r.scope) },
              ]}
            />
            {report.gaps.rows.length > 0 ? (
              <Text style={pdfStyles.note}>
                {report.gaps.teamWide} team-wide · {report.gaps.withoutAction} with no agreed action.
              </Text>
            ) : null}
            {report.gaps.observation ? (
              <Text style={pdfStyles.note}>{report.gaps.observation}</Text>
            ) : null}

            <WwwSection title="WWW review — carried in" section={report.wwwReview} />
            <WwwSection title="WWW — new commitments" section={report.newWww} />

            {discussions.some(([, rows]) => discussionLines(rows).length > 0) ? (
              <>
                <SectionTitle>Discussions</SectionTitle>
                {discussions.map(([label, rows]) =>
                  discussionLines(rows).length > 0 ? (
                    <View key={label}>
                      <Text style={pdfStyles.h3}>{label}</Text>
                      <Bullets items={discussionLines(rows)} />
                    </View>
                  ) : null,
                )}
              </>
            ) : null}
            {report.discussions.deferred.length > 0 ? (
              <Text style={pdfStyles.warn}>
                Deferred in the meeting: {report.discussions.deferred.join(", ")}
              </Text>
            ) : null}

            <SectionTitle>Meeting scorecard</SectionTitle>
            <DataTable<ScoreRow>
              rows={report.scorecard.metrics}
              emptyNote="The scorecard could not be computed for this meeting."
              columns={[
                { header: "#", width: 24, align: "center", cell: (r) => String(r.n) },
                { header: "Metric", flex: 2.4, cell: (r) => r.label },
                { header: "Reading", flex: 1.6, cell: (r) => r.reading + (r.derivedProxy ? " (proxy)" : "") },
                {
                  header: "RAG",
                  width: 56,
                  align: "center",
                  cell: (r) => humanize(r.rag),
                  color: (r) => RAG_COLOR[r.rag],
                },
              ]}
            />
            <Text style={pdfStyles.note}>
              Overall: {report.scorecard.overall.reading} ({humanize(report.scorecard.overall.rag)})
            </Text>
          </>
        )}

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
