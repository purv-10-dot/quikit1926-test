"use client";

/**
 * Daily Huddle Weekly Report — downloadable PDF (react-pdf).
 *
 * Mirrors the on-screen sections §4.1–§4.6 plus WWW suggestions, using the
 * org's own name in the header. Consumed via `pdf(...).toBlob()` from
 * `DownloadWeeklyReportButtons`, the same lazy-import pattern as
 * `DailyAdherencePdfDoc`.
 */
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { StoredWeeklyReport } from "@/lib/ai/weeklyHuddleCompose";

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n}%`);

const ATTENDANCE = {
  PRESENT: { mark: "✓", bg: "#F0FDF4", color: "#166534" },
  ABSENT: { mark: "✗", bg: "#FEF2F2", color: "#991B1B" },
  NA: { mark: "NA", bg: "#F8FAFC", color: "#94A3B8" },
} as const;

const STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: "Open", color: "#B91C1C" },
  IN_PROGRESS: { label: "In Progress", color: "#B45309" },
  RESOLVED: { label: "Resolved", color: "#166534" },
};

const KIND: Record<string, string> = {
  BLOCKER: "Blocker",
  KPI_RELATED: "KPI-related",
  PRIORITY_RELATED: "Priority-related",
  ACTION: "Action",
};

const styles = StyleSheet.create({
  page: { paddingHorizontal: 28, paddingVertical: 26, fontFamily: "Helvetica", fontSize: 9, color: "#1F2937" },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: "#0F766E",
    paddingBottom: 8,
    marginBottom: 10,
  },
  orgName: { fontFamily: "Helvetica-Bold", fontSize: 13, color: "#0F766E" },
  orgTagline: { fontSize: 7, fontStyle: "italic", color: "#64748B", marginTop: 1 },
  titleBlock: { alignItems: "flex-end" },
  reportTitle: { fontFamily: "Helvetica-Bold", fontSize: 14, color: "#111827" },
  reportSub: { fontSize: 8, color: "#64748B", marginTop: 1 },

  h2: { fontFamily: "Helvetica-Bold", fontSize: 11, color: "#0F172A", marginTop: 12, marginBottom: 5 },
  h3: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#334155", marginTop: 8, marginBottom: 4 },
  note: { fontSize: 7, fontStyle: "italic", color: "#64748B", marginTop: 3 },
  warn: { fontSize: 7, fontStyle: "italic", color: "#B45309", marginTop: 3 },

  detailsTable: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 3 },
  detailsRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  detailsLabel: { width: 160, backgroundColor: "#F8FAFC", padding: 5, fontFamily: "Helvetica-Bold", fontSize: 8, color: "#334155" },
  detailsValue: { flex: 1, padding: 5, fontSize: 8 },

  tilesRow: { flexDirection: "row", gap: 6 },
  tile: { flex: 1, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 3, paddingVertical: 6, alignItems: "center" },
  tileValue: { fontFamily: "Helvetica-Bold", fontSize: 13, color: "#111827" },
  tileLabel: { fontSize: 6.5, color: "#64748B", marginTop: 1, textAlign: "center" },

  table: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 3, marginTop: 4 },
  tHead: { flexDirection: "row", backgroundColor: "#EFF6FF" },
  th: { padding: 5, fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#1E3A8A" },
  tRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  tTotal: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#E2E8F0", backgroundColor: "#F8FAFC" },
  td: { padding: 5, fontSize: 8 },
  tdCenter: { padding: 5, fontSize: 8, textAlign: "center" },
  bold: { fontFamily: "Helvetica-Bold" },

  bullet: { flexDirection: "row", marginBottom: 2 },
  bulletDot: { width: 10, fontSize: 8 },
  bulletText: { flex: 1, fontSize: 8, lineHeight: 1.35 },

  obsRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  obsLabel: { width: 120, backgroundColor: "#F8FAFC", padding: 5, fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#334155" },
  obsText: { flex: 1, padding: 5, fontSize: 8, lineHeight: 1.35 },

  footer: { position: "absolute", bottom: 16, left: 28, right: 28, textAlign: "center", fontSize: 7, fontStyle: "italic", color: "#94A3B8" },
});

export default function WeeklyReportPdfDoc({
  report,
  orgName,
}: {
  report: StoredWeeklyReport;
  orgName: string;
}) {
  const { meetingDetails: md, executive, attendance, heatMap, stucks, facilitatorObservations: fo } = report;
  const team = heatMap.teamAverage;

  const details: [string, string][] = [
    ["Meeting Type", md.meetingType],
    ["Week", md.weekLabel],
    ["Planned Start Time", md.plannedStartTime ?? "—"],
    ["Planned End Time", md.plannedEndTime ?? "—"],
    ["Planned Duration", md.plannedDurationMinutes ? `${md.plannedDurationMinutes} minutes` : "—"],
    ["Day DH doesn't happen", md.nonHuddleDay ? md.nonHuddleDay.replace(/^./, (c) => c.toUpperCase()) : "—"],
    ["# of team members", String(md.teamMemberCount)],
  ];

  const tiles: [string, string][] = [
    ["DHs Planned", String(executive.metrics.huddlesPlanned)],
    ["DHs Conducted", String(executive.metrics.huddlesConducted)],
    ["Avg Attendance", pct(executive.metrics.averageAttendancePct)],
    ["Started On Time", pct(executive.metrics.startedOnTimePct)],
    [
      "Avg Duration",
      executive.metrics.averageDurationMinutes === null ? "—" : `${executive.metrics.averageDurationMinutes}m`,
    ],
  ];

  const observations: [string, string][] = [
    ["Attendance & Participation", fo.attendanceParticipation.text],
    ["Strong Performers", fo.strongPerformers.text],
    ["Achievement Gap", fo.achievementGap.text],
    ["Focus Specificity", fo.focusSpecificity.text],
    ["Stuck Protocol", fo.stuckProtocol.text],
    ["Recommendations", fo.recommendations.text],
  ];

  // Attendance columns are dynamic (one per huddle day), so share the width.
  const dayWidth = attendance.columns.length ? `${52 / attendance.columns.length}%` : "0%";

  return (
    <Document title={report.title}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.orgName}>{orgName}</Text>
            <Text style={styles.orgTagline}>Meeting Rhythm · Accountability</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.reportTitle}>Daily Huddle Weekly Report</Text>
            <Text style={styles.reportSub}>
              {report.clientName} · {report.weekLabel}
            </Text>
          </View>
        </View>

        {/* 1. Meeting Details */}
        <Text style={styles.h2}>1. Meeting Details</Text>
        <View style={styles.detailsTable}>
          {details.map(([label, value], i) => (
            <View key={label} style={i === details.length - 1 ? [styles.detailsRow, { borderBottomWidth: 0 }] : styles.detailsRow}>
              <Text style={styles.detailsLabel}>{label}</Text>
              <Text style={styles.detailsValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* 2. Executive Summary */}
        <Text style={styles.h2}>2. Executive Summary</Text>
        <View style={styles.tilesRow}>
          {tiles.map(([label, value]) => (
            <View key={label} style={styles.tile}>
              <Text style={styles.tileValue}>{value}</Text>
              <Text style={styles.tileLabel}>{label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.h3}>Agenda Adherence (Team)</Text>
        <View style={styles.table}>
          <View style={styles.tHead}>
            <Text style={[styles.th, { width: "70%" }]}>Agenda Item</Text>
            <Text style={[styles.th, { width: "30%", textAlign: "center" }]}>Adherence</Text>
          </View>
          {(
            [
              ["Yesterday Achievement", team.achievementPct],
              ["Today's Focus", team.focusPct],
              ["Stucks", team.stuckPct],
            ] as const
          ).map(([label, value]) => (
            <View key={label} style={styles.tRow}>
              <Text style={[styles.td, { width: "70%" }]}>{label}</Text>
              <Text style={[styles.tdCenter, { width: "30%" }]}>{pct(value)}</Text>
            </View>
          ))}
        </View>

        {executive.keyHighlights.length ? (
          <>
            <Text style={styles.h3}>Key Highlights</Text>
            {executive.keyHighlights.map((h, i) => (
              <View key={i} style={styles.bullet}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{h}</Text>
              </View>
            ))}
          </>
        ) : null}

        {/* 3. Attendance Analysis */}
        {attendance.rows.length ? (
          <>
            <Text style={styles.h2} break>
              3. Attendance Analysis
            </Text>
            <View style={styles.table}>
              <View style={styles.tHead}>
                <Text style={[styles.th, { width: "30%" }]}>Team Member</Text>
                {attendance.columns.map((c) => (
                  <Text key={c.date} style={[styles.th, { width: dayWidth, textAlign: "center" }]}>
                    {c.weekday}
                  </Text>
                ))}
                <Text style={[styles.th, { width: "18%", textAlign: "center" }]}>Attendance %</Text>
              </View>
              {attendance.rows.map((row) => (
                <View key={row.memberId} style={styles.tRow}>
                  <Text style={[styles.td, { width: "30%" }]}>{row.name}</Text>
                  {row.cells.map((cell) => {
                    const a = ATTENDANCE[cell.state];
                    return (
                      <Text
                        key={cell.date}
                        style={[styles.tdCenter, styles.bold, { width: dayWidth, backgroundColor: a.bg, color: a.color }]}
                      >
                        {a.mark}
                      </Text>
                    );
                  })}
                  <Text style={[styles.tdCenter, styles.bold, { width: "18%" }]}>{pct(row.attendancePct)}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.note}>
              NA = no huddle held that day, or the member was on planned leave — excluded from the percentage.
            </Text>
          </>
        ) : null}

        {/* 4. Adherence Heat Map */}
        {heatMap.rows.length ? (
          <>
            <Text style={styles.h2}>4. Adherence Heat Map</Text>
            <View style={styles.table}>
              <View style={styles.tHead}>
                <Text style={[styles.th, { width: "32%" }]}>Team Member</Text>
                <Text style={[styles.th, { width: "20%", textAlign: "center" }]}>Yesterday Achievement</Text>
                <Text style={[styles.th, { width: "16%", textAlign: "center" }]}>Today Focus</Text>
                <Text style={[styles.th, { width: "16%", textAlign: "center" }]}>Stuck</Text>
                <Text style={[styles.th, { width: "16%", textAlign: "center" }]}>Avg Score</Text>
              </View>
              {heatMap.rows.map((row) => (
                <View key={row.memberId ?? row.participant} style={styles.tRow}>
                  <Text style={[styles.td, { width: "32%" }]}>{row.participant}</Text>
                  <Text style={[styles.tdCenter, { width: "20%" }]}>{pct(row.achievementPct)}</Text>
                  <Text style={[styles.tdCenter, { width: "16%" }]}>{pct(row.focusPct)}</Text>
                  <Text style={[styles.tdCenter, { width: "16%" }]}>{pct(row.stuckPct)}</Text>
                  <Text style={[styles.tdCenter, styles.bold, { width: "16%" }]}>{pct(row.avgScorePct)}</Text>
                </View>
              ))}
              <View style={styles.tTotal}>
                <Text style={[styles.td, styles.bold, { width: "32%" }]}>Team Average</Text>
                <Text style={[styles.tdCenter, styles.bold, { width: "20%" }]}>{pct(team.achievementPct)}</Text>
                <Text style={[styles.tdCenter, styles.bold, { width: "16%" }]}>{pct(team.focusPct)}</Text>
                <Text style={[styles.tdCenter, styles.bold, { width: "16%" }]}>{pct(team.stuckPct)}</Text>
                <Text style={[styles.tdCenter, { width: "16%", color: "#94A3B8" }]}>–</Text>
              </View>
            </View>
            {heatMap.unrecognized.length ? (
              <Text style={styles.warn}>
                Excluded — could not be matched to the client roster:{" "}
                {heatMap.unrecognized.map((u) => `${u.name} (${u.reason})`).join(", ")}
              </Text>
            ) : null}
          </>
        ) : null}

        {/* 5. Stucks & Blockers */}
        <Text style={styles.h2} break>
          5. Stucks &amp; Blockers
        </Text>
        <Text style={styles.h3}>A. All Stucks Raised During the Week</Text>
        {stucks.all.length ? (
          <View style={styles.table}>
            <View style={styles.tHead}>
              <Text style={[styles.th, { width: "13%" }]}>Date</Text>
              <Text style={[styles.th, { width: "16%" }]}>Raised By</Text>
              <Text style={[styles.th, { width: "16%" }]}>Raised For</Text>
              <Text style={[styles.th, { width: "42%" }]}>Blocker</Text>
              <Text style={[styles.th, { width: "13%" }]}>Status</Text>
            </View>
            {stucks.all.map((b, i) => (
              <View key={`${b.huddleId}-${i}`} style={styles.tRow} wrap={false}>
                <Text style={[styles.td, { width: "13%" }]}>{b.date}</Text>
                <Text style={[styles.td, { width: "16%" }]}>{b.raisedBy}</Text>
                <Text style={[styles.td, { width: "16%" }]}>{b.raisedFor ?? "—"}</Text>
                <Text style={[styles.td, { width: "42%" }]}>
                  {b.description}
                  {b.impact ? ` — Impact: ${b.impact}` : ""}
                </Text>
                <Text style={[styles.td, styles.bold, { width: "13%", color: b.status ? STATUS[b.status].color : "#94A3B8" }]}>
                  {b.status ? STATUS[b.status].label : "—"}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.note}>No stucks were raised this week.</Text>
        )}

        <Text style={styles.h3}>B. Recurring Stucks</Text>
        {stucks.recurring.length ? (
          <View style={styles.table}>
            <View style={styles.tHead}>
              <Text style={[styles.th, { width: "34%" }]}>Blocker</Text>
              <Text style={[styles.th, { width: "16%", textAlign: "center" }]}># of Occurrences</Text>
              <Text style={[styles.th, { width: "18%" }]}>Raised By</Text>
              <Text style={[styles.th, { width: "18%" }]}>Raised For</Text>
              <Text style={[styles.th, { width: "14%" }]}>Status</Text>
            </View>
            {stucks.recurring.map((g, i) => (
              <View key={i} style={styles.tRow} wrap={false}>
                <Text style={[styles.td, { width: "34%" }]}>{g.blocker}</Text>
                <Text style={[styles.tdCenter, { width: "16%" }]}>{g.occurrences}</Text>
                <Text style={[styles.td, { width: "18%" }]}>{g.raisedBy.join(", ") || "—"}</Text>
                <Text style={[styles.td, { width: "18%" }]}>{g.raisedFor.join(", ") || "—"}</Text>
                <Text style={[styles.td, styles.bold, { width: "14%", color: g.status ? STATUS[g.status].color : "#94A3B8" }]}>
                  {g.status ? STATUS[g.status].label : "—"}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.note}>No stuck recurred this week.</Text>
        )}

        {/* 6. Facilitator Observations */}
        <Text style={styles.h2}>6. Facilitator Observations &amp; Recommendations</Text>
        <View style={styles.table}>
          {observations.map(([label, text]) => (
            <View key={label} style={styles.obsRow} wrap={false}>
              <Text style={styles.obsLabel}>{label}</Text>
              <Text style={styles.obsText}>{text}</Text>
            </View>
          ))}
        </View>

        {/* 7. WWW suggestions */}
        {report.wwwSuggestions.length ? (
          <>
            <Text style={styles.h2}>7. WWW Suggestions</Text>
            <View style={styles.table}>
              <View style={styles.tHead}>
                <Text style={[styles.th, { width: "16%" }]}>Who</Text>
                <Text style={[styles.th, { width: "48%" }]}>What</Text>
                <Text style={[styles.th, { width: "18%" }]}>When</Text>
                <Text style={[styles.th, { width: "18%" }]}>Source</Text>
              </View>
              {report.wwwSuggestions.map((w, i) => (
                <View key={i} style={styles.tRow} wrap={false}>
                  <Text style={[styles.td, { width: "16%" }]}>{w.who || "—"}</Text>
                  <Text style={[styles.td, { width: "48%" }]}>
                    {w.what} [{KIND[w.kind] ?? w.kind}]
                  </Text>
                  <Text style={[styles.td, { width: "18%", color: w.when ? "#1F2937" : "#B45309" }]}>
                    {w.when || "Not stated — flagged"}
                  </Text>
                  <Text style={[styles.td, { width: "18%" }]}>{w.sourceDate ?? "—"}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `${orgName} · Daily Huddle Weekly Report · ${report.weekLabel} · Page ${pageNumber} of ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
