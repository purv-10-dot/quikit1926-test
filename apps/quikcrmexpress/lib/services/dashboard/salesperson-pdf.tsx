/**
 * Salesperson Performance Report — React PDF document.
 *
 * Rendered server-side via @react-pdf/renderer.
 * DO NOT import this file directly in client components or Next.js
 * route handlers — always go through salesperson-pdf-buffer.ts.
 */

import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { SalespersonDetailDto } from "@/lib/dashboard/salesperson-detail-types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function delta(curr: number, prev: number): string {
  if (prev === 0) return curr > 0 ? `+${curr}` : "—";
  const pct = Math.round(((curr - prev) / prev) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function rate(num: number, den: number): string {
  if (den === 0) return "—";
  return `${Math.round((num / den) * 100)}%`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const BRAND = "#2563EB";
const BRAND_LIGHT = "#EFF6FF";
const SUCCESS = "#16A34A";
const MUTED = "#64748B";
const BORDER = "#E2E8F0";
const TEXT = "#0F172A";
const TEXT_LIGHT = "#475569";
const WHITE = "#FFFFFF";
const AMBER = "#D97706";
const RED = "#DC2626";

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    backgroundColor: WHITE,
    paddingTop: 0,
    paddingBottom: 28,
    paddingHorizontal: 0,
  },

  // Header band
  header: {
    backgroundColor: BRAND,
    paddingHorizontal: 32,
    paddingVertical: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: { flex: 1 },
  reportTitle: { fontSize: 18, fontFamily: "Helvetica-Bold", color: WHITE, marginBottom: 3 },
  reportSubtitle: { fontSize: 10, color: "#BFDBFE" },
  headerRight: { alignItems: "flex-end" },
  headerDate: { fontSize: 9, color: "#BFDBFE", marginBottom: 2 },
  headerRange: { fontSize: 10, fontFamily: "Helvetica-Bold", color: WHITE },

  // Body padding
  body: { paddingHorizontal: 32 },

  // User card
  userCard: {
    backgroundColor: BRAND_LIGHT,
    borderRadius: 8,
    padding: 16,
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BRAND,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontFamily: "Helvetica-Bold", color: WHITE },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: TEXT, marginBottom: 2 },
  userEmail: { fontSize: 10, color: TEXT_LIGHT },
  scoreBadge: {
    backgroundColor: BRAND,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
  },
  scoreValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: WHITE },
  scoreLabel: { fontSize: 8, color: "#BFDBFE", marginTop: 1 },

  // Section header
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: BRAND,
    marginTop: 18,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },

  // KPI grid
  kpiGrid: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  kpiCard: {
    flex: 1,
    minWidth: "22%",
    backgroundColor: "#F8FAFC",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
  },
  kpiValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: TEXT, marginBottom: 1 },
  kpiLabel: { fontSize: 8.5, color: MUTED, marginBottom: 2 },
  kpiDelta: { fontSize: 8, color: SUCCESS },
  kpiDeltaNeg: { fontSize: 8, color: RED },

  // Two-column layout
  row2: { flexDirection: "row", gap: 8 },
  col: { flex: 1 },

  // Metric item (label + value inline)
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  metricLabel: { fontSize: 9, color: TEXT_LIGHT },
  metricValue: { fontSize: 9, fontFamily: "Helvetica-Bold", color: TEXT },
  metricBadge: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },

  // Table
  table: { marginTop: 4 },
  tableHead: { flexDirection: "row", backgroundColor: "#F1F5F9", paddingVertical: 5, paddingHorizontal: 8 },
  tableHeadCell: { fontSize: 8, fontFamily: "Helvetica-Bold", color: MUTED },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  tableCell: { fontSize: 8.5, color: TEXT },
  tableCellMuted: { fontSize: 8.5, color: MUTED },

  // Footer
  footer: {
    position: "absolute",
    bottom: 10,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
  },
  footerText: { fontSize: 8, color: MUTED },
});

// ─── Initials helper ──────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  deltaStr,
}: {
  label: string;
  value: string | number;
  deltaStr?: string;
}) {
  const isNeg = deltaStr?.startsWith("-");
  return (
    <View style={s.kpiCard}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{String(value)}</Text>
      {deltaStr && (
        <Text style={isNeg ? s.kpiDeltaNeg : s.kpiDelta}>{deltaStr} vs prior</Text>
      )}
    </View>
  );
}

function MetricRow({ label, value, badge, badgeColor }: { label: string; value: string; badge?: string; badgeColor?: string }) {
  return (
    <View style={s.metricRow}>
      <Text style={s.metricLabel}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={s.metricValue}>{value}</Text>
        {badge && (
          <Text style={[s.metricBadge, { backgroundColor: badgeColor ?? "#F1F5F9", color: TEXT }]}>
            {badge}
          </Text>
        )}
      </View>
    </View>
  );
}

function gradeColor(pct: number): string {
  if (pct >= 70) return "#DCFCE7"; // green-100
  if (pct >= 40) return "#FEF9C3"; // yellow-100
  return "#FEE2E2";                 // red-100
}

function gradeBadge(pct: number): string {
  if (pct >= 70) return "Excellent";
  if (pct >= 40) return "Good";
  if (pct >= 10) return "Average";
  return "Needs work";
}

// ─── Main document ────────────────────────────────────────────────────────────

interface Props {
  data: SalespersonDetailDto;
  generatedAt?: string;
}

export function SalespersonPdfDocument({ data, generatedAt }: Props) {
  const k = data.kpis;
  const p = data.prevKpis;
  const rangeLabel = `${fmtDate(data.range.fromIso)} – ${fmtDate(data.range.toIso)}`;
  const genDate = generatedAt ?? new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  // Performance rates
  const leadConversionPct = k.leadsCreated > 0 ? Math.round((k.leadsConverted / k.leadsCreated) * 100) : 0;
  const dealWinPct = (k.dealsWon + k.dealsLost) > 0 ? Math.round((k.dealsWon / (k.dealsWon + k.dealsLost)) * 100) : 0;
  const quoteWinPct = (k.quotesWon + k.quotesLost) > 0 ? Math.round((k.quotesWon / (k.quotesWon + k.quotesLost)) * 100) : 0;
  const taskCompletionPct = k.totalTasks > 0 ? Math.round((k.tasksCompleted / k.totalTasks) * 100) : 0;

  return (
    <Document title={`Salesperson Report — ${data.userName}`} author="QuikCRM">
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.reportTitle}>Sales Performance Report</Text>
            <Text style={s.reportSubtitle}>QuikCRM · Executive Overview</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerDate}>Report period</Text>
            <Text style={s.headerRange}>{rangeLabel}</Text>
          </View>
        </View>

        <View style={s.body}>

          {/* ── User card ── */}
          <View style={s.userCard}>
            <View style={s.avatarCircle}>
              <Text style={s.avatarText}>{initials(data.userName)}</Text>
            </View>
            <View style={s.userInfo}>
              <Text style={s.userName}>{data.userName}</Text>
              {data.userEmail && <Text style={s.userEmail}>{data.userEmail}</Text>}
              {data.lastLoginIso && (
                <Text style={[s.userEmail, { marginTop: 2 }]}>
                  Last login: {fmtDate(data.lastLoginIso)}
                </Text>
              )}
            </View>
            <View style={s.scoreBadge}>
              <Text style={s.scoreValue}>{k.activityScore}</Text>
              <Text style={s.scoreLabel}>Activity Score</Text>
            </View>
          </View>

          {/* ── Section 1: Pipeline KPIs ── */}
          <Text style={s.sectionTitle}>Pipeline Performance</Text>
          <View style={s.kpiGrid}>
            <KpiCard label="Leads Created"     value={k.leadsCreated}     deltaStr={delta(k.leadsCreated, p.leadsCreated)} />
            <KpiCard label="Leads Converted"   value={k.leadsConverted}   deltaStr={delta(k.leadsConverted, p.leadsConverted)} />
            <KpiCard label="Opportunities"     value={k.opportunitiesCreated} />
            <KpiCard label="Deals Won"         value={k.dealsWon}         deltaStr={delta(k.dealsWon, p.dealsWon)} />
          </View>

          {/* ── Section 2: Revenue ── */}
          <Text style={s.sectionTitle}>Revenue Metrics</Text>
          <View style={s.row2}>
            <View style={s.col}>
              <MetricRow label="Revenue Won"       value={k.revenueWonDisplay} />
              <MetricRow label="Avg Deal Size"     value={k.avgDealSizeDisplay} />
              <MetricRow label="Total Pipeline"    value={k.totalPipelineDisplay} />
            </View>
            <View style={s.col}>
              <MetricRow label="Deals Lost"        value={String(k.dealsLost)} />
              <MetricRow label="Quotes Created"    value={String(k.quotesCreated)} />
              <MetricRow label="Quotes Won"        value={String(k.quotesWon)} />
            </View>
          </View>

          {/* ── Section 3: Activity KPIs ── */}
          <Text style={s.sectionTitle}>Activity Summary</Text>
          <View style={s.kpiGrid}>
            <KpiCard label="Calls Made"    value={k.calls}          deltaStr={delta(k.calls, p.calls)} />
            <KpiCard label="Emails Sent"   value={k.emails}         deltaStr={delta(k.emails, p.emails)} />
            <KpiCard label="Meetings"      value={k.meetings}       deltaStr={delta(k.meetings, p.meetings)} />
            <KpiCard label="Tasks Done"    value={k.tasksCompleted} deltaStr={delta(k.tasksCompleted, p.tasksCompleted)} />
          </View>
          <View style={[s.kpiGrid, { marginTop: 8 }]}>
            <KpiCard label="Notes Added"   value={k.notesAdded} />
            <KpiCard label="Overdue Tasks" value={k.overdueTasksCount} />
            <KpiCard label="Connected Calls" value={k.callsConnected} />
            <KpiCard label="Calls Connected %" value={`${rate(k.callsConnected, k.calls)}`} />
          </View>

          {/* ── Section 4: Performance Rates ── */}
          <Text style={s.sectionTitle}>Performance Rates</Text>
          <View style={s.row2}>
            <View style={s.col}>
              <MetricRow
                label="Lead Conversion Rate"
                value={`${leadConversionPct}%`}
                badge={gradeBadge(leadConversionPct)}
                badgeColor={gradeColor(leadConversionPct)}
              />
              <MetricRow
                label="Deal Win Rate"
                value={`${dealWinPct}%`}
                badge={gradeBadge(dealWinPct)}
                badgeColor={gradeColor(dealWinPct)}
              />
            </View>
            <View style={s.col}>
              <MetricRow
                label="Quote Win Rate"
                value={`${quoteWinPct}%`}
                badge={gradeBadge(quoteWinPct)}
                badgeColor={gradeColor(quoteWinPct)}
              />
              <MetricRow
                label="Task Completion Rate"
                value={`${taskCompletionPct}%`}
                badge={gradeBadge(taskCompletionPct)}
                badgeColor={gradeColor(taskCompletionPct)}
              />
            </View>
          </View>

          {/* ── Section 5: Recent Leads (top 5) ── */}
          {data.recentLeads.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Recent Leads (last 5)</Text>
              <View style={s.table}>
                <View style={s.tableHead}>
                  <Text style={[s.tableHeadCell, { flex: 2 }]}>Lead Name</Text>
                  <Text style={[s.tableHeadCell, { flex: 2 }]}>Company</Text>
                  <Text style={[s.tableHeadCell, { flex: 1 }]}>Stage</Text>
                  <Text style={[s.tableHeadCell, { flex: 1 }]}>Created</Text>
                </View>
                {data.recentLeads.slice(0, 5).map((lead) => (
                  <View key={lead.id} style={s.tableRow}>
                    <Text style={[s.tableCell, { flex: 2 }]}>{lead.name}</Text>
                    <Text style={[s.tableCellMuted, { flex: 2 }]}>{lead.company || "—"}</Text>
                    <Text style={[s.tableCellMuted, { flex: 1 }]}>{lead.stage}</Text>
                    <Text style={[s.tableCellMuted, { flex: 1 }]}>{fmtDate(lead.createdAtIso)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

        </View>

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>QuikCRM · Sales Performance Report · {data.userName}</Text>
          <Text style={s.footerText}>Generated {genDate}</Text>
        </View>

      </Page>
    </Document>
  );
}
