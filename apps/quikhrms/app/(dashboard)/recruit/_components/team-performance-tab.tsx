"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { Select } from "@/components/hrms/select";
import { Modal } from "@/components/hrms/modal";
import { DonutView, StackedBarView, ScoreBarChartView, FunnelView } from "@/components/hrms/charts";
import { clsx } from "clsx";
import {
  Briefcase, Users, Calendar, Send, Award, Clock, ShieldCheck, TrendingUp, TrendingDown, CheckSquare, Hourglass, AlertCircle, PenLine, History,
  AlertTriangle, CalendarClock, ChevronRight, Info,
} from "lucide-react";
import { bandFor } from "@/lib/recruit/scoring";
import { prettyStage } from "@/lib/services/pipeline-stages";
import { ActivityTimelineList, type ActivityEntry } from "./activity-timeline";
import { SlaHealthGauge } from "./sla-health-gauge";
import { PipelineTargetWidget } from "./pipeline-target-widget";
import { RecruiterReportPanel } from "./recruiter-report-panel";
import { recruitAccentStyle } from "@/lib/theme/recruit-accent";

export interface RecruiterRow {
  employeeId: string;
  name: string;
  activeRequisitions: number;
  positionsAssigned: number;
  activeCandidates: number;
  interviewsThisWeek: number;
  offersSentThisWeek: number;
  hiresThisMonth: number;
  avgTimeToFillDays: number | null;
  medianTimeToFillDays: number | null;
  avgTimeToHireDays: number | null;
  medianTimeToHireDays: number | null;
  // Multi-Stage TAT — replaces the old single-clock Green/Amber/Red SLA.
  positionToOfferInTat: number;
  positionToOfferAtRisk: number;
  positionToOfferMissed: number;
  sourcedToInterviewInTat: number;
  sourcedToInterviewAtRisk: number;
  sourcedToInterviewMissed: number;
  deadlineOnTrack: number;
  deadlineAtRisk: number;
  deadlineMissed: number;
  deadlineOriginalMissed: number;
  positionsClosed: number;
  avgTimeToClosePositionDays: number | null;
  escalations: number;
  dateRevisions: number;
  positions: {
    id: string; positionCode: string; status: string; requisitionId: string; requisitionTitle: string; requisitionNumber: string;
    slaStatus: "IN_TAT" | "AT_RISK" | "MISSED" | null; rawSlaStatus: "IN_TAT" | "AT_RISK" | "MISSED" | null;
    daysLeft: number | null; slaRevisionCount: number; targetDays: number; daysExtended: number; revisedDeadline: string | null;
    filledCandidateId: string | null; filledCandidateName: string | null; slaRevisionReason: string | null;
    assignedAt: string | null; recruiterName: string;
    pipelineCandidates: { id: string; candidateId: string; name: string; currentStage: string | null; appliedDate: string }[];
  }[];
  activeRequisitionsList: { id: string; title: string; requisitionNumber: string; status: string; filledPositions: number; positions: number }[];
  activeCandidatesList: { id: string; candidateId: string; name: string; requisitionTitle: string; currentStage: string | null; appliedDate: string }[];
  hiresThisMonthList: { id: string; candidateId: string; name: string; requisitionTitle: string; hiredAt: string | null }[];
  interviewsThisWeekList: { id: string; candidateId: string; name: string; requisitionTitle: string; type: string; round: number; scheduledAt: string }[];
  offersSentThisWeekList: { id: string; candidateId: string; name: string; requisitionTitle: string; offerStatus: string | null; offerSentAt: string | null }[];
  // 7-KPI weighted Performance Score — present only for an HR/Admin-scope
  // caller (recruiters don't see their own score yet).
  score?: {
    overallScore: number | null;
    band: string | null;
    scoredKpiCount: number;
    totalKpiCount: number;
    breakdown: {
      code: string; label: string; value: number | null; sampleSize: number;
      weightPct: number; effectiveWeightPct: number | null; normalizedScore: number | null;
      included: boolean; insufficientData: boolean;
    }[];
  };
  // "Why is this number what it is" — the actual candidates/positions
  // behind each KPI, one list per KPI code. Same HR/Admin-only gate as `score`.
  scoreExplain?: Record<string, ExplainItem[]>;
}

export interface ExplainItem {
  label: string;
  requisitionTitle: string;
  outcome: string;
  detail: string;
}
export interface PerfData {
  recruiters: RecruiterRow[];
  orgAverage: { avgTimeToFillDays: number | null; medianTimeToFillDays: number | null; avgTimeToHireDays: number | null; medianTimeToHireDays: number | null } | null;
  funnel: { stage: string; label: string; count: number; stagePct: number | null; overallPct: number }[];
  stageTat: { stage: string; avgDays: number; count: number }[];
  monthlyTrends: { month: string; hires: number; closedRequisitions: number; avgTimeToFillDays: number | null }[];
  departmentBreakdown: { department: string; count: number }[];
  kpiTrends: {
    newRequisitionsThisWeek: number; requisitionsWowPct: number | null;
    newCandidatesThisWeek: number; candidatesWowPct: number | null;
    hiresThisMonthTotal: number; hiresLastMonthTotal: number; hiresMomPct: number | null;
    offersMadeThisMonth: number; offersMadeLastMonth: number; offersMadeMomPct: number | null;
    positionsFilledThisMonth: number; positionsFilledLastMonth: number; positionsFilledMomPct: number | null;
    avgTimeToFillMomPct: number | null;
  };
  scope: "all" | "self";
}

// Re-exported so existing importers (`import { prettyStage } from
// "./team-performance-tab"`) keep working — the actual mapping lives in
// lib/services/pipeline-stages.ts, the SAME one the Hiring Pipeline board
// uses, so a stage name reads identically everywhere in the app.
export { prettyStage };

// Multi-Stage TAT — worst-case badge for a set of (inTat/atRisk/missed) or
// (onTrack/atRisk/missed) counts. Mirrors the old single SLA% badge's spirit
// (one glanceable status) without collapsing the detail into a fake average.
function tatBadge(good: number, atRisk: number, missed: number, goodLabel: string, atRiskLabel: string, missedLabel: string) {
  const total = good + atRisk + missed;
  if (total === 0) return <span className="text-gray-400 text-[11px]">—</span>;
  if (missed > 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 bg-red-50 text-red-700 ring-red-200" title={`${good} ${goodLabel} · ${atRisk} ${atRiskLabel} · ${missed} ${missedLabel}`}>
        {missed} {missedLabel}
      </span>
    );
  }
  if (atRisk > 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 bg-amber-50 text-amber-700 ring-amber-200" title={`${good} ${goodLabel} · ${atRisk} ${atRiskLabel}`}>
        {atRisk} {atRiskLabel}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 bg-green-50 text-green-700 ring-green-200">
      {good} {goodLabel}
    </span>
  );
}
/** A table-cell number that opens that row's own detail list — same "click a number, see what's behind it" pattern as the KPI tiles above, just scoped to one recruiter. */
function cellLink(n: number, onClick: () => void) {
  return (
    <button type="button" onClick={onClick} title="Click to see the list behind this number"
      className="inline-flex items-center gap-1 font-semibold text-accent-700 underline underline-offset-2 decoration-accent-300 hover:decoration-accent-600 hover:text-accent-800 tabular-nums">
      {n}
    </button>
  );
}
export const positionToOfferBadge = (r: RecruiterRow) => tatBadge(r.positionToOfferInTat, r.positionToOfferAtRisk, r.positionToOfferMissed, "IN TAT", "AT RISK", "MISSED");
export const sourcedToInterviewBadge = (r: RecruiterRow) => tatBadge(r.sourcedToInterviewInTat, r.sourcedToInterviewAtRisk, r.sourcedToInterviewMissed, "IN TAT", "AT RISK", "MISSED");
export const deadlineBadge = (r: RecruiterRow) => tatBadge(r.deadlineOnTrack, r.deadlineAtRisk, r.deadlineMissed, "ON TRACK", "AT RISK", "MISSED");

const BAND_TONE: Record<string, string> = {
  Excellent: "bg-green-50 text-green-700 ring-green-200",
  Strong: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Needs Attention": "bg-amber-50 text-amber-700 ring-amber-200",
  "Below Expectations": "bg-orange-50 text-orange-700 ring-orange-200",
  Critical: "bg-red-50 text-red-700 ring-red-200",
};
const BAND_BAR_COLOR: Record<string, string> = {
  Excellent: "bg-green-500", Strong: "bg-emerald-500", "Needs Attention": "bg-amber-500",
  "Below Expectations": "bg-orange-500", Critical: "bg-red-500",
};
const KPI_DESCRIPTIONS: Record<string, string> = {
  TIME_TO_OFFER: "Deadline discipline, not a day-count — a missed Position→Offer deadline always gets a Revise SLA. Scored per position: 0 revisions = 100, 1 = 50, 2+ = 0.",
  TIME_TO_HIRE: "Candidate sourced date → joining/onboard date, vs. the level's overall SLA — lower is better.",
  SLA_COMPLIANCE: "Daily pipeline-throughput target achievement (Job Levels → Pipeline Targets), averaged across every stage/level this recruiter had activity in.",
  INTERVIEW_TO_OFFER: "Offers released ÷ candidates interviewed.",
  OFFER_ACCEPTANCE: "Offers accepted ÷ offers released.",
  OFFER_TO_JOINING: "Candidates joined ÷ offers accepted.",
  POSITION_CLOSURE: "Positions closed ÷ positions assigned.",
  PROCESS_COMPLIANCE: "Whether mandatory reasons were logged for rejections/declines/parks, and whether deadlines were met without needing a revision.",
};
/** Score pill — never shown without its "N of 8 KPIs" caveat, per the scoring model's own explainability rule. */
export function scorePill(score: RecruiterRow["score"]) {
  if (!score || score.overallScore == null || !score.band) {
    return <span className="text-gray-400 text-[11px]">Insufficient history</span>;
  }
  const tone = BAND_TONE[score.band] ?? "bg-gray-50 text-gray-600 ring-gray-200";
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1", tone)}>
        {score.overallScore} · {score.band}
      </span>
      <span className="text-[9.5px] text-gray-400">{score.scoredKpiCount} of {score.totalKpiCount} KPIs</span>
    </div>
  );
}

const GOOD_OUTCOMES = new Set(["On Time", "Fast", "Passed Screening", "Got Offer", "Hired", "Reason Given", "No SLA Revision", "Counted"]);

/** The records behind one KPI's number — a card per candidate/position, name+status on one line (never needs horizontal scroll to see the status), requisition+detail below it. Used for both the 6-row inline preview and the "View all" sub-modal. */
function ExplainCards({ items }: { items: ExplainItem[] }) {
  if (items.length === 0) return <p className="text-[11px] text-gray-400 px-2 py-4 text-center">No records.</p>;
  return (
    <div className="rounded-lg border border-gray-100 bg-white overflow-hidden divide-y divide-gray-100">
      {items.map((it, i) => {
        const good = GOOD_OUTCOMES.has(it.outcome);
        return (
          <div key={i} className="flex items-start gap-2 px-2.5 py-2">
            <span className={clsx("w-1.5 h-1.5 rounded-full mt-1.5 shrink-0", good ? "bg-green-500" : "bg-red-500")} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] font-semibold text-gray-800 truncate">{it.label}</span>
                <span className={clsx("shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold", good ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600")}>
                  {it.outcome}
                </span>
              </div>
              <div className="text-[10.5px] text-gray-400 mt-0.5 truncate">{it.requisitionTitle} · {it.detail}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Ascending by normalized score — the KPI actually dragging the score down sorts first, insufficient-data ones trail at the end. */
function sortKpisBySeverity(breakdown: NonNullable<RecruiterRow["score"]>["breakdown"]) {
  return [...breakdown].sort((a, b) => {
    if (a.insufficientData && b.insufficientData) return 0;
    if (a.insufficientData) return 1;
    if (b.insufficientData) return -1;
    return (a.normalizedScore ?? 0) - (b.normalizedScore ?? 0);
  });
}

/** Performance tab — workload, SLA and hiring performance. Shown under the Recruitment Dashboard's "Team/My Performance" tab.
 * `toolbarContainer` — when the page provides a DOM node (placed next to its tab switcher), the "Updated…" pill and
 * recruiter filter portal into it instead of rendering their own row, so they sit on the same line as the tab switcher. */
export function TeamPerformanceTab({ toolbarContainer }: { toolbarContainer?: HTMLElement | null } = {}) {
  const api = useApiClient();
  const { hasPermission } = useDashboardConfig();
  const canSeeAll = hasPermission("hrms.recruit.performance.read");
  const [recruiterFilter, setRecruiterFilter] = useState("");
  // Clicking a stat card opens its detail list on THIS page — never a
  // redirect, and always built only from whatever recruiter(s) are currently
  // in scope (self, or the filtered/all set) — never someone else's data.
  const [detailModal, setDetailModal] = useState<null | "requisitions" | "candidates" | "hires" | "interviews" | "offers">(null);
  // Set only when a detail modal is opened from a specific TABLE ROW (vs. the
  // top KPI tiles, which stay aggregate across whatever's in scope) — scopes
  // the same modal down to just that one recruiter's own list.
  const [detailRecruiter, setDetailRecruiter] = useState<RecruiterRow | null>(null);
  const openRowDetail = (r: RecruiterRow, modal: NonNullable<typeof detailModal>) => { setDetailRecruiter(r); setDetailModal(modal); };
  const [activityRecruiter, setActivityRecruiter] = useState<{ id: string; name: string } | null>(null);
  const [scoreRecruiter, setScoreRecruiter] = useState<RecruiterRow | null>(null);
  // Which KPI is showing in the Performance Score modal's right-hand detail
  // pane — defaults to whichever KPI is dragging the score down most (see
  // sortKpisBySeverity) the moment the modal opens for a recruiter.
  const [selectedKpi, setSelectedKpi] = useState<string | null>(null);
  // Set when "View all" is clicked on a KPI's record list — opens the full
  // (unbounded) list in its own sub-modal instead of the 6-record preview.
  const [viewAllKpi, setViewAllKpi] = useState<string | null>(null);

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["recruiter-performance", recruiterFilter],
    queryFn: () => api.get<PerfData>(`/api/v1/hrms/recruit/recruiter-performance${recruiterFilter ? `?recruiterId=${recruiterFilter}` : ""}`),
    staleTime: 60_000,
  });
  const d = data?.data;

  const totals = d ? {
    // A requisition split across multiple recruiters (recruiterSplits) shows
    // up in EACH of their activeRequisitions counts — summing those counts
    // would count that one requisition once per recruiter it's split across.
    // Dedupe by requisition id instead, so a split req still counts as one.
    activeReqs: new Set(d.recruiters.flatMap((r) => r.activeRequisitionsList.map((x) => x.id))).size,
    hiresThisMonth: d.recruiters.reduce((s, r) => s + r.hiresThisMonth, 0),
  } : null;

  // Mini-metric cards — a simple aggregate over whatever's currently visible
  // (one recruiter when self-scoped or filtered, several under "all"). Sums
  // for counts, plain average across recruiters for day-based metrics — a
  // deliberately simple approximation, not recomputed from raw per-candidate
  // data, consistent with the existing org-average card below the table.
  const avgOfVisible = (key: "avgTimeToFillDays" | "medianTimeToFillDays" | "avgTimeToHireDays" | "medianTimeToHireDays" | "avgTimeToClosePositionDays") => {
    if (!d) return null;
    const vals = d.recruiters.map((r) => r[key]).filter((v): v is number => v != null);
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  };
  const miniMetrics = d ? {
    avgTTF: avgOfVisible("avgTimeToFillDays"),
    medianTTF: avgOfVisible("medianTimeToFillDays"),
    avgTTH: avgOfVisible("avgTimeToHireDays"),
    medianTTH: avgOfVisible("medianTimeToHireDays"),
    positionsClosed: d.recruiters.reduce((s, r) => s + r.positionsClosed, 0),
    avgTimeToClose: avgOfVisible("avgTimeToClosePositionDays"),
    escalations: d.recruiters.reduce((s, r) => s + r.escalations, 0),
    dateRevisions: d.recruiters.reduce((s, r) => s + r.dateRevisions, 0),
  } : null;
  const slaHealthPct = d ? (() => {
    const inTat = d.recruiters.reduce((s, r) => s + r.positionToOfferInTat, 0);
    const atRisk = d.recruiters.reduce((s, r) => s + r.positionToOfferAtRisk, 0);
    const missed = d.recruiters.reduce((s, r) => s + r.positionToOfferMissed, 0);
    const total = inTat + atRisk + missed;
    return total > 0 ? Math.round((inTat / total) * 100) : null;
  })() : null;

  // Detail-modal lists — union of whatever recruiter(s) are currently in
  // scope (self, filtered-to-one, or all). Never fetched fresh/unscoped —
  // built straight from the already-permission-scoped rows above.
  // Scoped to one recruiter's own row when opened from the table; otherwise
  // the aggregate across whatever's currently in scope (top KPI tiles).
  const detailLists = {
    requisitions: detailRecruiter ? detailRecruiter.activeRequisitionsList : (d?.recruiters ?? []).flatMap((r) => r.activeRequisitionsList),
    candidates: detailRecruiter ? detailRecruiter.activeCandidatesList : (d?.recruiters ?? []).flatMap((r) => r.activeCandidatesList),
    hires: detailRecruiter ? detailRecruiter.hiresThisMonthList : (d?.recruiters ?? []).flatMap((r) => r.hiresThisMonthList),
    interviews: detailRecruiter ? detailRecruiter.interviewsThisWeekList : (d?.recruiters ?? []).flatMap((r) => r.interviewsThisWeekList),
    offers: detailRecruiter ? detailRecruiter.offersSentThisWeekList : (d?.recruiters ?? []).flatMap((r) => r.offersSentThisWeekList),
  };
  const detailModalTitle = {
    requisitions: "Active Requisitions", candidates: "Active Candidates", hires: "Hires (This Month)",
    interviews: "Interviews This Week", offers: "Offers Sent This Week",
  };
  const closeDetailModal = () => { setDetailModal(null); setDetailRecruiter(null); };

  const funnelData = (d?.funnel ?? []).map((f) => ({ name: f.label, value: f.count, stagePct: f.stagePct, overallPct: f.overallPct }));

  // Requisitions by SLA Status — every currently-tracked position across
  // whatever recruiter(s) are in scope, bucketed the same way the "My
  // Assigned Positions" modal already does (closed seats and SLA-revised
  // seats called out separately from the live In TAT/At Risk/Missed clock).
  const allPositions = (d?.recruiters ?? []).flatMap((r) => r.positions);
  const slaStatusCounts = { "In TAT": 0, "At Risk": 0, Missed: 0, "SLA Revised": 0, Closed: 0 };
  for (const p of allPositions) {
    if (p.status === "Filled" || p.status === "Cancelled") slaStatusCounts.Closed++;
    else if (p.slaRevisionCount > 0) slaStatusCounts["SLA Revised"]++;
    else if (p.rawSlaStatus === "IN_TAT") slaStatusCounts["In TAT"]++;
    else if (p.rawSlaStatus === "AT_RISK") slaStatusCounts["At Risk"]++;
    else if (p.rawSlaStatus === "MISSED") slaStatusCounts.Missed++;
  }
  const slaStatusData = Object.entries(slaStatusCounts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  const slaStatusColors: Record<string, string> = {
    "In TAT": "#22c55e", "At Risk": "#f59e0b", Missed: "#ef4444", "SLA Revised": "#8b5cf6", Closed: "#94a3b8",
  };

  // Upcoming Deadlines — the soonest live (open/pending) seats, oldest
  // clock first, so the most urgent breach risk surfaces at the top.
  const upcomingDeadlines = allPositions
    .filter((p) => (p.status === "Open" || p.status === "PendingOnboarding") && p.daysLeft != null)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
    .slice(0, 5);

  // Performance Summary — one vertical bar per recruiter, height = their
  // overall weighted Score (0-100, every KPI mixed into one number — the
  // same Score behind the SLA Score column), colored by band so a glance
  // says who's doing well vs. struggling. Sorted best-first.
  const scoreBarData = (d?.recruiters ?? [])
    .filter((r) => r.score?.overallScore != null && r.score.band)
    .map((r) => ({ name: r.name, value: r.score!.overallScore as number, band: r.score!.band as string }))
    .sort((a, b) => b.value - a.value);

  const reqsByRecruiterData = (d?.recruiters ?? []).map((r) => ({ name: r.name, Open: r.activeRequisitions, Filled: r.positionsClosed }));

  const toolbar = (
    <>
      {d && (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-50 text-gray-500 ring-1 ring-gray-200 whitespace-nowrap shrink-0">
          Updated {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
        </span>
      )}
      {canSeeAll && d && d.recruiters.length > 0 && (
        <div className="w-56 shrink-0">
          <Select value={recruiterFilter} onChange={setRecruiterFilter}
            placeholder="All recruiters"
            options={[{ value: "", label: "All recruiters" }, ...d.recruiters.map((r) => ({ value: r.employeeId, label: r.name }))]} />
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-4" style={recruitAccentStyle}>
      {toolbarContainer ? createPortal(toolbar, toolbarContainer) : (
        <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">{toolbar}</div>
      )}

      {isLoading ? <SkeletonCards count={4} /> : !d || d.recruiters.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 p-8 text-center text-gray-500">
          No recruiter activity yet — assign a recruiter to a requisition to see performance here.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-[13px] font-bold text-gray-800">{d.scope === "self" ? "Your workload" : "All company"}</h2>
            <div className="flex items-center gap-3">
              {d.scope === "self" && d.recruiters[0] && (
                <button type="button" onClick={() => setActivityRecruiter({ id: d.recruiters[0].employeeId, name: d.recruiters[0].name })}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent-600 hover:text-accent-700">
                  <History size={12} /> View my activity
                </button>
              )}
              <p className="text-[11px] text-gray-400">Click any tile — or any underlined number in the table below — to see what sits behind it.</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {(() => {
              const tiles = [
                { icon: <Briefcase size={16} />, n: totals!.activeReqs, l: "Total Requisitions", sub: `${d.kpiTrends.newRequisitionsThisWeek} new this week`, trendPct: d.kpiTrends.requisitionsWowPct, invert: false, bg: "bg-violet-50", fg: "text-violet-600", modal: "requisitions" as const },
                { icon: <CheckSquare size={16} />, n: d.kpiTrends.positionsFilledThisMonth, l: "Positions Filled", sub: "This month", trendPct: d.kpiTrends.positionsFilledMomPct, invert: false, bg: "bg-teal-50", fg: "text-teal-600", modal: null },
                { icon: <Clock size={16} />, n: miniMetrics?.avgTTF != null ? `${miniMetrics.avgTTF}d` : "—", l: "Time to Fill (Avg)", sub: miniMetrics?.medianTTF != null ? `Median ${miniMetrics.medianTTF}d` : "No data", trendPct: d.kpiTrends.avgTimeToFillMomPct, invert: true, bg: "bg-sky-50", fg: "text-sky-600", modal: null },
                { icon: <Send size={16} />, n: d.kpiTrends.offersMadeThisMonth, l: "Offers Made", sub: "This month", trendPct: d.kpiTrends.offersMadeMomPct, invert: false, bg: "bg-amber-50", fg: "text-amber-600", modal: null },
                { icon: <Award size={16} />, n: totals!.hiresThisMonth, l: "Hires (This Month)", sub: "vs last month", trendPct: d.kpiTrends.hiresMomPct, invert: false, bg: "bg-orange-50", fg: "text-orange-600", modal: "hires" as const },
                {
                  icon: (
                    <div className="relative grid place-items-center w-9 h-9 shrink-0">
                      <div className="w-9 h-9 rounded-full" style={{ background: `conic-gradient(#16a34a ${slaHealthPct ?? 0}%, #e5efe9 0)` }} />
                      <div className="absolute w-6 h-6 rounded-full bg-white" />
                    </div>
                  ),
                  n: slaHealthPct != null ? `${slaHealthPct}%` : "—", l: "SLA Compliance",
                  sub: d.scope === "self" ? "Your positions" : "Position→Offer, org-wide", trendPct: null as number | null, invert: false, bg: "", fg: "", modal: null,
                },
              ];
              return tiles.map((k, i) => {
                const active = !!k.modal && detailModal === k.modal && !detailRecruiter;
                const goodTrend = k.trendPct != null && (k.invert ? k.trendPct < 0 : k.trendPct >= 0);
                return (
                  <div key={i} onClick={k.modal ? () => { setDetailRecruiter(null); setDetailModal(k.modal); } : undefined}
                    className={clsx("rounded-xl shadow-sm border p-3.5 transition-all duration-200",
                      active ? "bg-accent-50 border-accent-200" : "bg-white border-gray-200 hover:shadow-md",
                      k.modal && "cursor-pointer hover:-translate-y-0.5 hover:border-accent-200")}>
                    <div className="flex items-center gap-3">
                      {k.bg ? (
                        <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", active ? "bg-accent-100 text-accent-700" : clsx(k.bg, k.fg))}>{k.icon}</div>
                      ) : k.icon}
                      <div className="min-w-0">
                        <div className={clsx("text-lg font-bold leading-none", active ? "text-accent-800" : "text-gray-900")}>{k.n}</div>
                        <div className={clsx("text-[10.5px] font-bold uppercase tracking-wide mt-1", active ? "text-accent-600" : "text-gray-400")}>{k.l}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {k.sub && <span className={clsx("text-[10.5px] font-medium truncate", active ? "text-accent-600" : "text-gray-400")}>{k.sub}</span>}
                      {k.trendPct != null && (
                        <span className={clsx("inline-flex items-center gap-0.5 text-[10.5px] font-bold shrink-0", goodTrend ? "text-green-600" : "text-red-500")}>
                          {k.trendPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {Math.abs(k.trendPct)}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {miniMetrics && (
            <div className="flex items-stretch gap-3 flex-wrap">
              <div className="flex-1 min-w-[420px] bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 p-3.5 grid grid-cols-2 md:grid-cols-6 gap-4">
                {[
                  { icon: <Clock size={14} />, l: "Avg Time-to-Fill", v: miniMetrics.avgTTF != null ? `${miniMetrics.avgTTF}d` : "—", sub: `Median ${miniMetrics.medianTTF ?? "—"}${miniMetrics.medianTTF != null ? "d" : ""}` },
                  { icon: <Calendar size={14} />, l: "Avg Time-to-Hire", v: miniMetrics.avgTTH != null ? `${miniMetrics.avgTTH}d` : "—", sub: `Median ${miniMetrics.medianTTH ?? "—"}${miniMetrics.medianTTH != null ? "d" : ""}` },
                  { icon: <CheckSquare size={14} />, l: "Positions Closed", v: String(miniMetrics.positionsClosed), sub: "This month view" },
                  { icon: <Hourglass size={14} />, l: "Avg Time to Close", v: miniMetrics.avgTimeToClose != null ? `${miniMetrics.avgTimeToClose}d` : "—", sub: miniMetrics.avgTimeToClose != null ? "" : "No data" },
                  { icon: <AlertCircle size={14} />, l: "Escalations", v: String(miniMetrics.escalations), sub: "SLA breaches" },
                  { icon: <PenLine size={14} />, l: "Date Revisions", v: String(miniMetrics.dateRevisions), sub: "Total" },
                ].map((m, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-md bg-gray-50 text-gray-400 flex items-center justify-center shrink-0 mt-0.5">{m.icon}</div>
                    <div className="min-w-0">
                      <div className="text-[11px] text-gray-500">{m.l}</div>
                      <div className="text-base font-bold text-gray-900 leading-tight">{m.v}</div>
                      {m.sub && <div className="text-[10px] text-gray-400">{m.sub}</div>}
                    </div>
                  </div>
                ))}
              </div>
              {slaHealthPct != null && (
                <SlaHealthGauge pct={slaHealthPct} caption={d.scope === "self" ? "Position → Offer, your positions" : "Position → Offer, org-wide"} />
              )}
            </div>
          )}

          <PipelineTargetWidget
            recruiterId={recruiterFilter || undefined}
            title={
              d.scope === "self"
                ? "Your Pipeline Activity"
                : recruiterFilter
                  ? `Pipeline Activity — ${d.recruiters.find((r) => r.employeeId === recruiterFilter)?.name ?? "Recruiter"}`
                  : "Pipeline Activity — Company-wide"
            }
          />

          {canSeeAll && d.recruiters.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 p-4">
                <h2 className="text-[13px] font-semibold text-gray-900 mb-1">Performance Summary</h2>
                <p className="text-[11px] text-gray-400 mb-1">Each recruiter&apos;s overall weighted Score (0-100) — every KPI mixed into one number, colored by band.</p>
                {scoreBarData.length > 0 ? (
                  <ScoreBarChartView data={scoreBarData} height={280} />
                ) : (
                  <p className="text-[11px] text-gray-400 py-16 text-center">Needs at least one recruiter with a scored history.</p>
                )}
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 p-4">
                <h2 className="text-[13px] font-semibold text-gray-900 mb-1">Requisitions by Recruiter</h2>
                <p className="text-[11px] text-gray-400 mb-1">Open vs. filled, per recruiter.</p>
                <StackedBarView data={reqsByRecruiterData} keys={[{ key: "Open", label: "Open", color: "var(--accent-300)" }, { key: "Filled", label: "Filled", color: "var(--accent-700)" }]} height={260} />
              </div>
            </div>
          )}

          <RecruiterReportPanel recruiters={d.recruiters.map((r) => ({ employeeId: r.employeeId, name: r.name }))} />

          {/* Same table for both scopes — a self-scoped recruiter just gets
              one row (their own name, own numbers) and no Score column,
              which stays HR/Admin-only. */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 overflow-hidden">
            <h2 className="text-[13px] font-bold text-gray-800 px-3 pt-3 pb-1">Recruitment Pipeline Summary</h2>
            <div className="max-h-[500px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-accent-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2">Recruiter</th>
                  <th className="text-right px-3 py-2">Active Reqs</th>
                  <th className="text-right px-3 py-2">Positions</th>
                  <th className="text-right px-3 py-2">Candidates</th>
                  <th className="text-right px-3 py-2">Interviews / wk</th>
                  <th className="text-right px-3 py-2">Offers / wk</th>
                  <th className="text-right px-3 py-2">Hires / mo</th>
                  <th className="text-right px-3 py-2">Avg TTF</th>
                  <th className="text-right px-3 py-2">Avg TTH</th>
                  <th className="text-right px-3 py-2">Pos→Offer TAT</th>
                  <th className="text-right px-3 py-2">Sourced→Int TAT</th>
                  <th className="text-right px-3 py-2">Deadline</th>
                  {canSeeAll && <th className="text-right px-3 py-2">SLA Score</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {d.recruiters.map((r) => (
                  <tr key={r.employeeId} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">
                      <button type="button" onClick={() => setActivityRecruiter({ id: r.employeeId, name: r.name })}
                        className="hover:text-accent-700 hover:underline text-left">
                        {r.name}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">{cellLink(r.activeRequisitions, () => openRowDetail(r, "requisitions"))}</td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/recruit/positions?recruiterId=${r.employeeId}`} title="Open the full Assigned Positions page"
                        className="inline-flex items-center gap-1 font-semibold text-accent-700 underline underline-offset-2 decoration-accent-300 hover:decoration-accent-600 hover:text-accent-800 tabular-nums">
                        {r.positionsAssigned}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right">{cellLink(r.activeCandidates, () => openRowDetail(r, "candidates"))}</td>
                    <td className="px-3 py-2 text-right">{cellLink(r.interviewsThisWeek, () => openRowDetail(r, "interviews"))}</td>
                    <td className="px-3 py-2 text-right">{cellLink(r.offersSentThisWeek, () => openRowDetail(r, "offers"))}</td>
                    <td className="px-3 py-2 text-right">{cellLink(r.hiresThisMonth, () => openRowDetail(r, "hires"))}</td>
                    <td className="px-3 py-2 text-right">
                      {r.avgTimeToFillDays != null ? `${r.avgTimeToFillDays}d` : "—"}
                      {r.medianTimeToFillDays != null && <div className="text-[10px] text-gray-400">med {r.medianTimeToFillDays}d</div>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.avgTimeToHireDays != null ? `${r.avgTimeToHireDays}d` : "—"}
                      {r.medianTimeToHireDays != null && <div className="text-[10px] text-gray-400">med {r.medianTimeToHireDays}d</div>}
                    </td>
                    <td className="px-3 py-2 text-right">{positionToOfferBadge(r)}</td>
                    <td className="px-3 py-2 text-right">{sourcedToInterviewBadge(r)}</td>
                    <td className="px-3 py-2 text-right">
                      {deadlineBadge(r)}
                      {r.deadlineOriginalMissed > 0 && (
                        <div className="text-[10px] text-red-500 mt-0.5">{r.deadlineOriginalMissed} past original date</div>
                      )}
                    </td>
                    {canSeeAll && (
                      <td className="px-3 py-2 text-right">
                        {r.score ? (
                          <button type="button" onClick={() => { setScoreRecruiter(r); setSelectedKpi(r.score ? sortKpisBySeverity(r.score.breakdown)[0]?.code ?? null : null); }} className="hover:opacity-80">
                            {scorePill(r.score)}
                          </button>
                        ) : scorePill(r.score)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          {funnelData.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 p-4">
              <h2 className="text-[13px] font-semibold text-gray-900 mb-1 flex items-center gap-1.5"><ShieldCheck size={14} className="text-green-600" /> Recruitment Funnel</h2>
              <p className="text-[11px] text-gray-400 mb-3">Sourced → Onboarded — each stage&apos;s own conversion, and its conversion from the very top.</p>
              <FunnelView data={funnelData} height={280} />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {slaStatusData.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 p-4">
                <h2 className="text-[13px] font-semibold text-gray-900 mb-3 flex items-center gap-1.5"><AlertTriangle size={14} className="text-green-600" /> Requisitions by SLA Status</h2>
                <DonutView data={slaStatusData} height={220} colors={slaStatusData.map((s) => slaStatusColors[s.name])} legendPosition="bottom" />
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 text-xs">
                  <span className="font-semibold text-gray-700">Total Positions</span>
                  <span className="font-bold text-gray-900">{allPositions.length}</span>
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow duration-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-[13px] font-semibold text-gray-900 flex items-center gap-1.5"><CalendarClock size={14} className="text-green-600" /> Upcoming Deadlines</h2>
                <Link href="/recruit/positions" className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-accent-600 hover:text-accent-700">
                  View all <ChevronRight size={12} />
                </Link>
              </div>
              {upcomingDeadlines.length === 0 ? (
                <p className="text-[11px] text-gray-400 py-6 text-center">No open seats with a tracked deadline.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {upcomingDeadlines.map((p) => {
                    const eta = new Date(Date.now() + (p.daysLeft ?? 0) * 86_400_000);
                    const overdue = (p.daysLeft ?? 0) < 0;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-800 truncate">{p.requisitionTitle}</div>
                          <div className="text-[10.5px] text-gray-400 font-mono">{p.positionCode}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-gray-700">{eta.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                          <div className={clsx("text-[10.5px] font-medium", overdue ? "text-red-500" : "text-gray-400")}>
                            {overdue ? `${Math.abs(p.daysLeft ?? 0)}d over` : `${p.daysLeft}d left`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <Modal open={!!detailModal} onClose={closeDetailModal} size="md"
        title={detailModal ? (detailRecruiter ? `${detailRecruiter.name} — ${detailModalTitle[detailModal]}` : detailModalTitle[detailModal]) : ""}>
        {detailModal === "requisitions" && (
          detailLists.requisitions.length === 0 ? <p className="text-xs text-gray-400">Nothing here.</p> : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {detailLists.requisitions.map((r) => (
                <Link key={r.id} href={`/recruit/requisitions?view=${r.id}`}
                  className="block px-2.5 py-2 text-xs hover:bg-gray-50 transition">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-medium text-gray-800 truncate">{r.title}</span>
                    <span className={clsx("inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-medium",
                      r.status === "ReqOnHold" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700")}>
                      {r.status.replace("Req", "")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-gray-400">
                    <span className="font-mono">{r.requisitionNumber}</span>
                    <span>· {r.filledPositions}/{r.positions} filled</span>
                  </div>
                </Link>
              ))}
            </div>
          )
        )}
        {detailModal === "candidates" && (
          detailLists.candidates.length === 0 ? <p className="text-xs text-gray-400">Nothing here.</p> : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {detailLists.candidates.map((c) => (
                <Link key={c.id} href={`/recruit/candidates/${c.candidateId}`}
                  className="block px-2.5 py-2 text-xs hover:bg-gray-50 transition">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-medium text-gray-800 truncate">{c.name}</span>
                    {c.currentStage && (
                      <span className="inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-medium bg-purple-50 text-purple-700">
                        {prettyStage(c.currentStage)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-gray-400">
                    <span className="truncate">{c.requisitionTitle}</span>
                    <span>· Applied {new Date(c.appliedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                  </div>
                </Link>
              ))}
            </div>
          )
        )}
        {detailModal === "hires" && (
          detailLists.hires.length === 0 ? <p className="text-xs text-gray-400">Nothing here.</p> : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {detailLists.hires.map((h) => (
                <Link key={h.id} href={`/recruit/candidates/${h.candidateId}`}
                  className="block px-2.5 py-2 text-xs hover:bg-gray-50 transition">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-medium text-gray-800 truncate">{h.name}</span>
                    <span className="inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-medium bg-green-50 text-green-700">Hired</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-gray-400">
                    <span className="truncate">{h.requisitionTitle}</span>
                    {h.hiredAt && <span>· {new Date(h.hiredAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )
        )}
        {detailModal === "interviews" && (
          detailLists.interviews.length === 0 ? <p className="text-xs text-gray-400">Nothing here.</p> : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {detailLists.interviews.map((iv) => (
                <Link key={iv.id} href={`/recruit/candidates/${iv.candidateId}`}
                  className="block px-2.5 py-2 text-xs hover:bg-gray-50 transition">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-medium text-gray-800 truncate">{iv.name}</span>
                    <span className="inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-medium bg-purple-50 text-purple-700">{iv.type} · round {iv.round}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-gray-400">
                    <span className="truncate">{iv.requisitionTitle}</span>
                    <span>· {new Date(iv.scheduledAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </Link>
              ))}
            </div>
          )
        )}
        {detailModal === "offers" && (
          detailLists.offers.length === 0 ? <p className="text-xs text-gray-400">Nothing here.</p> : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {detailLists.offers.map((o) => (
                <Link key={o.id} href={`/recruit/candidates/${o.candidateId}`}
                  className="block px-2.5 py-2 text-xs hover:bg-gray-50 transition">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 font-medium text-gray-800 truncate">{o.name}</span>
                    {o.offerStatus && (
                      <span className="inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-medium bg-amber-50 text-amber-700">{o.offerStatus.replace("Offer", "")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-gray-400">
                    <span className="truncate">{o.requisitionTitle}</span>
                    {o.offerSentAt && <span>· sent {new Date(o.offerSentAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )
        )}
      </Modal>

      {activityRecruiter && (
        <RecruiterActivityModal recruiter={activityRecruiter} onClose={() => setActivityRecruiter(null)} />
      )}

      {scoreRecruiter?.score && (() => {
        const sorted = sortKpisBySeverity(scoreRecruiter.score.breakdown);
        const selected = sorted.find((k) => k.code === selectedKpi) ?? sorted[0];
        const items = scoreRecruiter.scoreExplain?.[selected.code] ?? [];
        const preview = items.slice(0, 6);
        const isPct = selected.code !== "TIME_TO_HIRE";
        const displayValue = selected.value != null ? `${Math.round(selected.value * 10) / 10}${isPct ? "%" : "× SLA"}` : null;
        const tier = selected.normalizedScore != null ? bandFor(selected.normalizedScore) : null;
        const overall = scoreRecruiter.score;
        return (
          <Modal open onClose={() => { setScoreRecruiter(null); setSelectedKpi(null); setViewAllKpi(null); }}
            title={`${scoreRecruiter.name} — Performance Score`} maxWidthClass="max-w-[820px]" maxHeightClass="max-h-[85vh]" bodyClassName="p-0 overflow-hidden">
            <div className="flex h-full min-h-[440px]">
              {/* Left — every KPI, worst first, click to inspect */}
              <div className="w-[230px] shrink-0 border-r border-gray-100 bg-gray-50 flex flex-col min-h-0">
                <div className="p-3.5 border-b border-gray-200">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Overall</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-xl font-bold text-gray-900 tabular-nums">{overall.overallScore ?? "—"}</span>
                    {overall.band && (
                      <span className={clsx("text-[10.5px] font-bold px-2 py-0.5 rounded-full ring-1", BAND_TONE[overall.band])}>{overall.band}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">{overall.scoredKpiCount} of {overall.totalKpiCount} KPIs scored</div>
                </div>
                <div className="flex-1 overflow-y-auto p-1.5">
                  {sorted.map((k) => {
                    const kTier = k.normalizedScore != null ? bandFor(k.normalizedScore) : null;
                    const active = k.code === selected.code;
                    return (
                      <button key={k.code} type="button" onClick={() => setSelectedKpi(k.code)}
                        className={clsx("w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left mb-0.5",
                          active ? "bg-white shadow-sm ring-1 ring-gray-200" : "hover:bg-gray-100")}>
                        <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0",
                          k.insufficientData ? "bg-gray-300" : kTier ? BAND_BAR_COLOR[kTier] : "bg-gray-300")} />
                        <span className={clsx("flex-1 min-w-0 text-[11.5px] font-semibold truncate", active ? "text-accent-700" : "text-gray-700")}>{k.label}</span>
                        {k.insufficientData ? (
                          <span className="text-[9.5px] text-gray-400 shrink-0">n/a</span>
                        ) : (
                          <span className="text-[11px] font-bold text-gray-900 tabular-nums shrink-0">
                            {k.value != null ? `${Math.round(k.value * 10) / 10}${k.code !== "TIME_TO_HIRE" ? "%" : "×"}` : "—"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right — the selected KPI's full detail */}
              <div className="flex-1 min-w-0 overflow-y-auto p-4">
                <h3 className="text-sm font-bold text-gray-900">{selected.label}</h3>
                {KPI_DESCRIPTIONS[selected.code] && <p className="text-[11.5px] text-gray-500 mt-1 max-w-[46ch]">{KPI_DESCRIPTIONS[selected.code]}</p>}

                {selected.insufficientData ? (
                  <div className="mt-4 p-3.5 border border-dashed border-gray-200 rounded-lg text-center text-[11px] text-gray-400">
                    Not enough records yet (n={selected.sampleSize}) — this KPI&apos;s weight is redistributed across the rest until it has more data.
                  </div>
                ) : (
                  <>
                    <div className="flex items-end justify-between gap-3 mt-4">
                      <div>
                        <div className="text-2xl font-bold text-gray-900 tabular-nums leading-none">{displayValue ?? "—"}</div>
                        <div className="text-[11px] text-accent-600 font-semibold mt-1">score {selected.normalizedScore != null ? Math.round(selected.normalizedScore) : "—"}</div>
                      </div>
                      <div className="text-[10.5px] text-gray-400 text-right leading-relaxed">
                        weight {selected.weightPct}%{selected.effectiveWeightPct != null && selected.effectiveWeightPct !== selected.weightPct ? ` → ${selected.effectiveWeightPct}%` : ""}
                        <br />n={selected.sampleSize}
                      </div>
                    </div>
                    <div className="relative mt-3 h-1.5">
                      <div className="absolute inset-0 rounded-full bg-gray-100 overflow-hidden">
                        <div className={clsx("h-full rounded-full", tier ? BAND_BAR_COLOR[tier] : "bg-gray-300")} style={{ width: `${Math.max(4, selected.normalizedScore ?? 0)}%` }} />
                      </div>
                      <div className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded bg-gray-300" style={{ left: "70%" }} title="Needs Attention cutoff" />
                    </div>
                  </>
                )}

                {(items.length > 0 || !selected.insufficientData) && (
                  <div className="mt-5 pt-4 border-t border-gray-100">
                    {tier && <p className="text-xs font-bold text-gray-800 mb-2">Why {selected.label} is {tier.toLowerCase()}?</p>}
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10.5px] text-gray-400">{items.length} record{items.length === 1 ? "" : "s"} behind this number</span>
                      {items.length > 6 && (
                        <button type="button" onClick={() => setViewAllKpi(selected.code)} className="text-[10.5px] font-semibold text-accent-600 hover:text-accent-700">View all</button>
                      )}
                    </div>
                    <ExplainCards items={preview} />
                  </div>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}

      {viewAllKpi && scoreRecruiter?.scoreExplain?.[viewAllKpi] && (
        <Modal open onClose={() => setViewAllKpi(null)} size="lg"
          title={`${scoreRecruiter.name} — ${scoreRecruiter.score?.breakdown.find((k) => k.code === viewAllKpi)?.label ?? viewAllKpi}`}
          subtitle={`${scoreRecruiter.scoreExplain[viewAllKpi].length} records`}>
          <div className="max-h-[70vh] overflow-y-auto">
            <ExplainCards items={scoreRecruiter.scoreExplain[viewAllKpi]} />
          </div>
        </Modal>
      )}
    </div>
  );
}

interface RecruiterActivityResponse {
  recruiter: { id: string; name: string };
  entries: ActivityEntry[];
}

/** "What did this recruiter do, and when" — across every requisition they're
 * on, date-grouped (e.g. "5 candidates moved to Source" on one line). */
function RecruiterActivityModal({ recruiter, onClose }: { recruiter: { id: string; name: string }; onClose: () => void }) {
  const api = useApiClient();
  const { data, isLoading } = useQuery({
    queryKey: ["recruiter-activity", recruiter.id],
    queryFn: () => api.get<RecruiterActivityResponse>(`/api/v1/hrms/recruit/recruiters/${recruiter.id}/activity`),
  });
  const res = data?.data;

  return (
    <Modal open onClose={onClose} title="Recruiter Activity" size="lg">
      <div className="space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          <p className="font-semibold text-slate-900">{recruiter.name}</p>
        </div>

        {isLoading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="shimmer rounded-full w-6 h-6 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="shimmer h-2.5 rounded w-3/5" />
                  <div className="shimmer h-2 rounded w-4/5" />
                </div>
              </div>
            ))}
          </div>
        ) : !res || res.entries.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-200 rounded-lg">
            <Clock size={28} className="mx-auto text-slate-300 mb-2" />
            <p className="text-[13px] font-semibold text-slate-700">No activity yet</p>
          </div>
        ) : (
          <ActivityTimelineList entries={res.entries} />
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button onClick={onClose} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Close</button>
        </div>
      </div>
    </Modal>
  );
}
