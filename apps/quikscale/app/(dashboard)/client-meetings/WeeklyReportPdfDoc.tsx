/**
 * Daily Huddle Weekly Report — downloadable PDF (react-pdf).
 *
 * Mirrors the on-screen sections §4.1–§4.6 plus WWW suggestions, using the
 * org's own name in the header. Consumed via `pdf(...).toBlob()` from
 * `DownloadWeeklyReportButtons`, the same lazy-import pattern as
 * `DailyAdherencePdfDoc`.
 */
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { pdfStyles } from "./reportPdfKit";
import type { StoredWeeklyReport } from "@/lib/ai/weeklyHuddleCompose";
import {
  buildWeeklyAdherenceSnapshot,
  SNAPSHOT_FLAG_LABEL,
  type SnapshotFlag,
} from "@/lib/ai/weeklyAdherenceSnapshot";

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n}%`);

/** Suffix marking a member who is shown but not scored. */
const TYPE_LABEL: Record<string, string> = { OPTIONAL: "Optional", EXTERNAL: "External" };

/**
 * Attendance marks.
 *
 * WinAnsi ONLY. react-pdf's built-in Helvetica is a standard PDF font limited
 * to the WinAnsi character set, and any glyph outside it is dropped SILENTLY —
 * which is exactly how the on-screen ✓ / ◐ / ✗ turned this table into a grid of
 * blank cells in the downloaded PDF while "NA" and "—" (both WinAnsi) still
 * printed. Letters + a legend below the table keep it readable in print and in
 * black and white. Do not reintroduce Unicode symbols here without registering
 * an embedded font that actually carries them.
 */
const ATTENDANCE: Record<string, { mark: string; bg: string; color: string }> = {
  PRESENT: { mark: "P", bg: "#F0FDF4", color: "#166534" },
  // Joined, but under the presence threshold — counted as half.
  PARTIAL: { mark: "½", bg: "#FFFBEB", color: "#92400E" },
  ABSENT: { mark: "A", bg: "#FEF2F2", color: "#991B1B" },
  NA: { mark: "NA", bg: "#F8FAFC", color: "#94A3B8" },
  // No evidence either way. Rendered blank rather than guessed, and excluded
  // from the percentage.
  UNKNOWN: { mark: "—", bg: "#F8FAFC", color: "#CBD5E1" },
};

const STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: "Open", color: "#B91C1C" },
  IN_PROGRESS: { label: "In Progress", color: "#B45309" },
  RESOLVED: { label: "Resolved", color: "#166534" },
};

const flag = (v: SnapshotFlag | null) => (v ? SNAPSHOT_FLAG_LABEL[v] : "—");

/**
 * The shared Meeting Rhythm PDF stylesheet.
 *
 * These rules used to live here and now live in `reportPdfKit`, unchanged, so
 * that the five report PDFs — which arrive in one zip from the bulk export —
 * cannot drift into five different-looking documents.
 */
const styles = pdfStyles;

/** Loose report rows carry `unknown`; render a string or nothing. */
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export default function WeeklyReportPdfDoc({
  report,
  orgName,
}: {
  report: StoredWeeklyReport;
  orgName: string;
}) {
  const { meetingDetails: md, executive, attendance, heatMap, stucks, facilitatorObservations: fo } = report;
  const team = heatMap.teamAverage;
  const snapshot = buildWeeklyAdherenceSnapshot(heatMap);
  // Rows are loosely typed because the shape is owned by
  // `lib/reports/wwwReview.ts`; duplicating it here would create a second
  // definition to keep in step.
  const reviewRows = (report.wwwReview?.rows ?? []) as Record<string, unknown>[];
  const newRows = (report.newWww?.rows ?? []) as Record<string, unknown>[];

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
            {/* A reader of a downloaded file cannot see the app badge, and is
                entitled to know a section was written by a facilitator rather
                than generated from the transcripts. */}
            {report.manualEdit ? (
              <Text style={[styles.reportSub, { color: "#92400E" }]}>
                Contains manual edits
              </Text>
            ) : null}
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
                  <Text style={[styles.td, { width: "30%" }]}>
                    {row.unmapped
                      ? `${row.name}  [Unmapped]`
                      : row.attendanceType === "REQUIRED"
                        ? row.name
                        : `${row.name}  [${TYPE_LABEL[row.attendanceType]}]`}
                  </Text>
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
              P = present · ½ = partial (joined below the presence threshold, counted as half) · A = absent ·
              — = no evidence either way, excluded from the percentage.
            </Text>
            <Text style={styles.note}>
              NA = no huddle held that day, or the member was on planned leave — excluded from the percentage.
            </Text>
          </>
        ) : null}

        {/* 4. Adherence — Snapshot first, then the Heat Map it derives from. */}
        {heatMap.rows.length ? (
          <>
            <Text style={styles.h2}>4. Adherence</Text>
            <Text style={styles.h3}>Adherence Snapshot</Text>
            <Text style={styles.note}>
              Rating Scale: Yes — complete, specific answer given. Partial — vague or incomplete.
              No — not addressed.
            </Text>
            <View style={styles.table}>
              <View style={styles.tHead}>
                <Text style={[styles.th, { width: "32%" }]}>Participant</Text>
                <Text style={[styles.th, { width: "14%", textAlign: "center" }]}>Achievement</Text>
                <Text style={[styles.th, { width: "12%", textAlign: "center" }]}>Focus</Text>
                <Text style={[styles.th, { width: "16%", textAlign: "center" }]}>
                  Stuck / Blockers
                </Text>
                <Text style={[styles.th, { width: "13%", textAlign: "center" }]}>Score</Text>
                <Text style={[styles.th, { width: "13%", textAlign: "center" }]}>Rating</Text>
              </View>
              {snapshot.rows.map((row) => (
                <View key={row.memberId ?? row.participant} style={styles.tRow}>
                  <Text style={[styles.td, { width: "32%" }]}>
                    {row.unmapped ? `${row.participant}  [Unmapped]` : row.participant}
                  </Text>
                  <Text style={[styles.tdCenter, { width: "14%" }]}>{flag(row.achievement)}</Text>
                  <Text style={[styles.tdCenter, { width: "12%" }]}>{flag(row.focus)}</Text>
                  <Text style={[styles.tdCenter, { width: "16%" }]}>{flag(row.stuck)}</Text>
                  <Text style={[styles.tdCenter, { width: "13%" }]}>{row.scoreLabel ?? "—"}</Text>
                  <Text style={[styles.tdCenter, styles.bold, { width: "13%" }]}>
                    {row.rating ?? "—"}
                  </Text>
                </View>
              ))}
            </View>
            <View style={[styles.tilesRow, { marginTop: 6 }]}>
              {([
                ["Full Adherence", snapshot.tiles.full],
                ["Good", snapshot.tiles.good],
                ["Partial", snapshot.tiles.partial],
                ["Poor", snapshot.tiles.poor],
                ["Total Attendees", snapshot.tiles.total],
              ] as const).map(([label, value]) => (
                <View key={label} style={styles.tile}>
                  <Text style={styles.tileValue}>{value}</Text>
                  <Text style={styles.tileLabel}>{label}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.note}>
              A flag summarises the whole week: answering on some days but not others reads as
              Partial. Totals count roster members only.
            </Text>

            <Text style={styles.h3}>Adherence Heat Map</Text>
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
                  <Text style={[styles.td, { width: "32%" }]}>
                    {row.memberId === null ? `${row.participant}  [Unmapped]` : row.participant}
                  </Text>
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

        {/* 7. WWW Review — rendered from the STORED report, like every other
            section, so a download never queries or calls a model. */}
        <Text style={styles.h2}>7. WWW Review</Text>
        {reviewRows.length ? (
          <View style={styles.table}>
            <View style={styles.tHead}>
              <Text style={[styles.th, { width: "16%" }]}>Owner</Text>
              <Text style={[styles.th, { width: "36%" }]}>WWW</Text>
              <Text style={[styles.th, { width: "16%" }]}>Previous</Text>
              <Text style={[styles.th, { width: "16%" }]}>Current</Text>
              <Text style={[styles.th, { width: "16%" }]}>Change</Text>
            </View>
            {reviewRows.map((r, i) => (
              <View key={i} style={styles.tRow} wrap={false}>
                <Text style={[styles.td, { width: "16%" }]}>{str(r.whoName) || "Unassigned"}</Text>
                <Text style={[styles.td, { width: "36%" }]}>{str(r.what) || "—"}</Text>
                {/* Never blank: a blank cell would read as "no change". */}
                <Text
                  style={[
                    styles.td,
                    { width: "16%", color: str(r.statusAtMeeting) ? "#1F2937" : "#94A3B8" },
                  ]}
                >
                  {str(r.statusAtMeeting) || "Not recorded"}
                </Text>
                <Text style={[styles.td, { width: "16%" }]}>{str(r.currentStatus) || "—"}</Text>
                <Text style={[styles.td, { width: "16%" }]}>{str(r.changeLabel) || "—"}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.note}>
            {str(report.wwwReview?.unavailableReason) ||
              "No previously-created WWW item was discussed this week."}
          </Text>
        )}

        {/* 8. New WWW */}
        <Text style={styles.h2}>8. WWW / New Action Items</Text>
        {newRows.length ? (
          <View style={styles.table}>
            <View style={styles.tHead}>
              <Text style={[styles.th, { width: "18%" }]}>Who</Text>
              <Text style={[styles.th, { width: "46%" }]}>What</Text>
              <Text style={[styles.th, { width: "18%" }]}>When</Text>
              <Text style={[styles.th, { width: "18%" }]}>Status</Text>
            </View>
            {newRows.map((r, i) => {
              const who = r.who as { userName?: string } | null | undefined;
              const missing = Array.isArray(r.missingFields) ? (r.missingFields as string[]) : [];
              const dated = !r.whenMissing && str(r.whenText);
              return (
                <View key={i} style={styles.tRow} wrap={false}>
                  <Text style={[styles.td, { width: "18%" }]}>
                    {who?.userName || str(r.whoRaw) || "Not identified"}
                  </Text>
                  <Text style={[styles.td, { width: "46%" }]}>{str(r.what) || "—"}</Text>
                  {/* An unstated date is flagged, never invented. */}
                  <Text style={[styles.td, { width: "18%", color: dated ? "#1F2937" : "#B45309" }]}>
                    {dated || "Not specified"}
                  </Text>
                  <Text style={[styles.td, { width: "18%" }]}>
                    {r.linkedWwwItemId
                      ? "Created"
                      : r.dismissedAt
                        ? "Dismissed"
                        : missing.length
                          ? `Needs ${missing.join(" & ")}`
                          : "Ready"}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : report.wwwSuggestions.length ? (
          <View style={styles.table}>
            <View style={styles.tHead}>
              <Text style={[styles.th, { width: "20%" }]}>Who</Text>
              <Text style={[styles.th, { width: "60%" }]}>What</Text>
              <Text style={[styles.th, { width: "20%" }]}>When</Text>
            </View>
            {report.wwwSuggestions.map((w, i) => (
              <View key={i} style={styles.tRow} wrap={false}>
                <Text style={[styles.td, { width: "20%" }]}>{w.who || "—"}</Text>
                <Text style={[styles.td, { width: "60%" }]}>{w.what}</Text>
                <Text style={[styles.td, { width: "20%", color: w.when ? "#1F2937" : "#B45309" }]}>
                  {w.when || "Not stated — flagged"}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.note}>
            {str(report.newWww?.unavailableReason) ||
              "No new action items were identified this week."}
          </Text>
        )}

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
