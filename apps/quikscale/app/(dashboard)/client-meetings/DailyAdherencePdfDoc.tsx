/**
 * Daily Huddle Adherence Report — downloadable PDF (react-pdf).
 *
 * Reproduces the 5-section shared-deliverable format (Meeting Details,
 * Attendance, Adherence Snapshot + summary tiles, Individual Participant
 * Breakdown, Stucks & Blockers) with the org's own name in the header
 * instead of a fixed third-party brand. Consumed via `pdf(...).toBlob()`
 * via the shared `DownloadPdfButton` in `MeetingReportPanel`.
 */
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { StoredMeetingReport } from "@/lib/ai/meetingReport";
import { summarizeAdherence } from "@/lib/ai/dailyAdherenceFormat";

type AdherenceRow = NonNullable<StoredMeetingReport["adherence"]>[number];

const RATING_COLOR: Record<string, { bg: string; text: string }> = {
  YES: { bg: "#F0FDF4", text: "#166534" },
  PARTIAL: { bg: "#FFFBEB", text: "#92400E" },
  NO: { bg: "#FEF2F2", text: "#991B1B" },
};
const RATING_LABEL: Record<string, string> = { YES: "Yes", PARTIAL: "Partial", NO: "No" };

const OVERALL_COLOR: Record<string, string> = {
  full: "#166534",
  good: "#15803D",
  partial: "#B45309",
  poor: "#B91C1C",
};

const styles = StyleSheet.create({
  page: { paddingHorizontal: 28, paddingVertical: 26, fontFamily: "Helvetica", fontSize: 9, color: "#1F2937" },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 2, borderBottomColor: "#0F766E", paddingBottom: 8, marginBottom: 4 },
  orgName: { fontFamily: "Helvetica-Bold", fontSize: 13, color: "#0F766E" },
  orgTagline: { fontSize: 7, fontStyle: "italic", color: "#64748B", marginTop: 1 },
  titleBlock: { alignItems: "flex-end" },
  reportTitle: { fontFamily: "Helvetica-Bold", fontSize: 15, color: "#111827" },
  reportDate: { fontSize: 8, color: "#64748B", marginTop: 1 },

  intro: { fontSize: 8, color: "#475569", lineHeight: 1.4, marginTop: 8, marginBottom: 10 },

  h2: { fontFamily: "Helvetica-Bold", fontSize: 11, color: "#0F172A", marginTop: 10, marginBottom: 5 },

  detailsTable: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 3, overflow: "hidden" },
  detailsRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E2E8F0" },
  detailsLabel: { width: 150, backgroundColor: "#F8FAFC", padding: 5, fontFamily: "Helvetica-Bold", fontSize: 8, color: "#334155" },
  detailsValue: { flex: 1, padding: 5, fontSize: 8, color: "#1F2937" },

  banner: { paddingHorizontal: 8, paddingVertical: 4, fontFamily: "Helvetica-Bold", fontSize: 9, color: "#FFFFFF" },
  presentWrap: { borderWidth: 1, borderColor: "#BBF7D0", borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  notPresentWrap: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 3, overflow: "hidden" },
  attendeeGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8, paddingVertical: 6 },
  attendeeItem: { width: "50%", fontSize: 8, marginBottom: 3, color: "#334155" },

  table: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 3, overflow: "hidden" },
  tHead: { flexDirection: "row", backgroundColor: "#0F172A" },
  th: { padding: 5, fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#FFFFFF" },
  tRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  td: { padding: 5, fontSize: 8 },

  tilesRow: { flexDirection: "row", marginTop: 6, gap: 6 },
  tile: { flex: 1, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 3, paddingVertical: 6, alignItems: "center" },
  tileValue: { fontFamily: "Helvetica-Bold", fontSize: 13 },
  tileLabel: { fontSize: 6.5, color: "#64748B", marginTop: 1, textAlign: "center" },

  card: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 3, marginBottom: 6, overflow: "hidden" },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#F8FAFC", paddingHorizontal: 8, paddingVertical: 5 },
  cardName: { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#111827" },
  cardRole: { fontSize: 7, fontStyle: "italic", color: "#64748B" },
  cardRating: { fontFamily: "Helvetica-Bold", fontSize: 8 },
  breakdownRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#F1F5F9" },
  breakdownLabel: { width: 100, padding: 5, fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#334155" },
  breakdownRating: { width: 46, padding: 5, fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  breakdownNote: { flex: 1, padding: 5, fontSize: 7.5, color: "#334155", lineHeight: 1.3 },

  blockerRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#E2E8F0" },
  blockerNum: { width: 16, padding: 5, fontSize: 8, color: "#64748B" },
  blockerBy: { width: 78, padding: 5, fontFamily: "Helvetica-Bold", fontSize: 8 },
  blockerCat: { width: 118, padding: 5, fontSize: 7 },
  blockerDesc: { flex: 1, padding: 5, fontSize: 7.5, lineHeight: 1.3 },
  catBadge: { alignSelf: "flex-start", backgroundColor: "#FEF2F2", color: "#B91C1C", paddingHorizontal: 4, paddingVertical: 2, borderRadius: 2, fontFamily: "Helvetica-Bold", fontSize: 6.5 },

  footer: { position: "absolute", bottom: 16, left: 28, right: 28, borderTopWidth: 1, borderTopColor: "#E2E8F0", paddingTop: 4, fontSize: 6.5, color: "#94A3B8", textAlign: "center" },
});

function DetailsRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.detailsRow}>
      <Text style={styles.detailsLabel}>{label}</Text>
      <Text style={styles.detailsValue}>{value}</Text>
    </View>
  );
}

export default function DailyAdherencePdfDoc({
  report,
  orgName,
}: {
  report: StoredMeetingReport;
  orgName: string;
}) {
  const adherence: AdherenceRow[] = report.adherence ?? [];
  const summary = summarizeAdherence(adherence);
  const present = report.attendance?.present ?? [];
  const notPresent = report.attendance?.notPresent ?? [];
  const blockers = report.blockers ?? [];
  const details = report.meetingDetails;
  const dateLabel = details?.dateLabel ?? report.meta?.date ?? "";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.orgName}>{orgName || "QuikScale"}</Text>
            <Text style={styles.orgTagline}>Performance OS — Meeting Rhythm</Text>
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.reportTitle}>Daily Huddle Adherence Report</Text>
            {dateLabel ? <Text style={styles.reportDate}>{dateLabel}</Text> : null}
          </View>
        </View>

        <Text style={styles.intro}>
          This report assesses each attendee&apos;s adherence to the daily huddle format. Each participant is
          evaluated against three criteria: a Significant Achievement from yesterday, a Focus Area for today, and
          disclosure of any Stuck or blocker. Ratings are derived directly from the meeting transcript.
        </Text>

        {/* 1. Meeting Details */}
        {details ? (
          <>
            <Text style={styles.h2}>1. Meeting Details</Text>
            <View style={styles.detailsTable}>
              <DetailsRow label="Meeting Type" value={details.meetingType} />
              <DetailsRow label="Date" value={details.dateLabel} />
              <DetailsRow label="Start (recording mark)" value={details.startMark} />
              <DetailsRow label="End (recording mark)" value={details.endMark} />
              <DetailsRow label="Total Duration" value={details.durationLabel} />
              <DetailsRow label="Time of Day" value={details.timeOfDay} />
            </View>
          </>
        ) : null}

        {/* 2. Attendance */}
        {present.length ? (
          <>
            <Text style={styles.h2}>2. Attendance</Text>
            <View style={styles.presentWrap}>
              <Text style={[styles.banner, { backgroundColor: "#15803D" }]}>Present ({present.length})</Text>
              <View style={styles.attendeeGrid}>
                {present.map((p, i) => (
                  <Text key={i} style={styles.attendeeItem}>
                    • {p.name}
                    {p.role ? `  ·  ${p.role}` : ""}
                  </Text>
                ))}
              </View>
            </View>
            {notPresent.length ? (
              <View style={styles.notPresentWrap}>
                <Text style={[styles.banner, { backgroundColor: "#475569" }]}>
                  Not Present ({notPresent.length}){report.attendance?.comparisonNote ? ` — ${report.attendance.comparisonNote}` : ""}
                </Text>
                <View style={styles.attendeeGrid}>
                  {/* "•" not "▪": Helvetica is WinAnsi-only in react-pdf and
                      drops anything outside it without warning. */}
                  {notPresent.map((name, i) => (
                    <Text key={i} style={styles.attendeeItem}>• {name}</Text>
                  ))}
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        {/* 3. Adherence Snapshot */}
        {adherence.length ? (
          <>
            <Text style={styles.h2}>3. Adherence Snapshot</Text>
            <View style={styles.table}>
              <View style={styles.tHead}>
                <Text style={[styles.th, { flex: 2 }]}>Participant</Text>
                <Text style={[styles.th, { width: 62, textAlign: "center" }]}>Achievement</Text>
                <Text style={[styles.th, { width: 50, textAlign: "center" }]}>Focus</Text>
                <Text style={[styles.th, { width: 62, textAlign: "center" }]}>Stuck</Text>
                <Text style={[styles.th, { width: 40, textAlign: "center" }]}>Score</Text>
                <Text style={[styles.th, { width: 46, textAlign: "center" }]}>Rating</Text>
              </View>
              {adherence.map((row, i) => (
                <View key={i} style={styles.tRow}>
                  <View style={{ flex: 2, padding: 5 }}>
                    <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8 }}>{row.participant}</Text>
                    {row.role ? <Text style={{ fontSize: 6.5, fontStyle: "italic", color: "#64748B" }}>{row.role}</Text> : null}
                  </View>
                  <RatingTd value={row.achievement} width={62} />
                  <RatingTd value={row.focus} width={50} />
                  <RatingTd value={row.stuck} width={62} />
                  <Text style={[styles.td, { width: 40, textAlign: "center", fontFamily: "Helvetica-Bold" }]}>{row.score ?? "—"}</Text>
                  <Text style={[styles.td, { width: 46, textAlign: "center", fontFamily: "Helvetica-Bold", color: OVERALL_COLOR[(row.rating ?? "").toLowerCase()] ?? "#334155" }]}>
                    {row.rating ?? "—"}
                  </Text>
                </View>
              ))}
            </View>
            <View style={styles.tilesRow}>
              {(
                [
                  ["Full Adherence", summary.full, "#166534"],
                  ["Good", summary.good, "#15803D"],
                  ["Partial", summary.partial, "#B45309"],
                  ["Poor", summary.poor, "#B91C1C"],
                  ["Total Attendees", summary.total, "#334155"],
                ] as const
              ).map(([label, value, color]) => (
                <View key={label} style={styles.tile}>
                  <Text style={[styles.tileValue, { color }]}>{value}</Text>
                  <Text style={styles.tileLabel}>{label}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* 4. Individual Participant Breakdown */}
        {adherence.length ? (
          <>
            <Text style={styles.h2} break>4. Individual Participant Breakdown</Text>
            {adherence.map((row, i) => (
              <View key={i} style={styles.card} wrap={false}>
                <View style={styles.cardHead}>
                  <View>
                    <Text style={styles.cardName}>{row.participant}</Text>
                    {row.role ? <Text style={styles.cardRole}>{row.role}</Text> : null}
                  </View>
                  <Text style={[styles.cardRating, { color: OVERALL_COLOR[(row.rating ?? "").toLowerCase()] ?? "#334155" }]}>
                    {row.rating ?? "—"} {row.score ? `| ${row.score}` : ""}
                  </Text>
                </View>
                <BreakdownRow label="Achievement (Yesterday)" value={row.achievement} note={row.achievementNote} />
                <BreakdownRow label="Focus Area (Today)" value={row.focus} note={row.focusNote} />
                <BreakdownRow label="Stuck / Blockers" value={row.stuck} note={row.stuckNote} />
              </View>
            ))}
          </>
        ) : null}

        {/* 5. Stucks & Blockers — Consolidated */}
        {blockers.length ? (
          <>
            <Text style={styles.h2} break={adherence.length > 6}>5. Stucks &amp; Blockers — Consolidated</Text>
            <Text style={{ fontSize: 7.5, color: "#64748B", marginBottom: 4 }}>
              A total of {blockers.length} blocker{blockers.length === 1 ? "" : "s"} raised during the huddle.
            </Text>
            <View style={styles.table}>
              <View style={styles.tHead}>
                <Text style={[styles.th, { width: 16 }]}>#</Text>
                <Text style={[styles.th, { width: 78 }]}>Raised By</Text>
                <Text style={[styles.th, { width: 118 }]}>Category</Text>
                <Text style={[styles.th, { flex: 1 }]}>Description &amp; Impact</Text>
              </View>
              {blockers.map((b, i) => (
                <View key={i} style={styles.blockerRow} wrap={false}>
                  <Text style={styles.blockerNum}>{i + 1}</Text>
                  <Text style={styles.blockerBy}>{b.raisedBy}</Text>
                  <View style={{ width: 118, padding: 5 }}>
                    <Text style={styles.catBadge}>{b.category}</Text>
                  </View>
                  <View style={styles.blockerDesc}>
                    <Text style={{ fontFamily: "Helvetica-Bold" }}>{b.description}</Text>
                    {b.impact ? <Text style={{ marginTop: 2, color: "#64748B" }}><Text style={{ fontFamily: "Helvetica-Bold" }}>Impact: </Text>{b.impact}</Text> : null}
                    {b.requiredAction ? <Text style={{ color: "#64748B" }}><Text style={{ fontFamily: "Helvetica-Bold" }}>Required action: </Text>{b.requiredAction}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <Text style={styles.footer} fixed>
          {orgName || "QuikScale"} · Daily Huddle Adherence Report{dateLabel ? ` — ${dateLabel}` : ""}
        </Text>
      </Page>
    </Document>
  );
}

function RatingTd({ value, width }: { value: string | null | undefined; width: number }) {
  const c = value ? RATING_COLOR[value] : null;
  return (
    <Text style={[styles.td, { width, textAlign: "center", backgroundColor: c?.bg, color: c?.text ?? "#94A3B8", fontFamily: c ? "Helvetica-Bold" : "Helvetica" }]}>
      {value ? RATING_LABEL[value] ?? value : "—"}
    </Text>
  );
}

function BreakdownRow({ label, value, note }: { label: string; value: string | null | undefined; note: string | null | undefined }) {
  const c = value ? RATING_COLOR[value] : null;
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={[styles.breakdownRating, { backgroundColor: c?.bg, color: c?.text ?? "#94A3B8" }]}>
        {value ? RATING_LABEL[value] ?? value : "—"}
      </Text>
      <Text style={styles.breakdownNote}>{note ?? "—"}</Text>
    </View>
  );
}
