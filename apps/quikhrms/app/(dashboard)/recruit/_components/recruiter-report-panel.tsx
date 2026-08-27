"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Select } from "@/components/hrms/select";
import { DonutView, BarChartView, MultiLineChartView } from "@/components/hrms/charts";
import { exportRecruiterReportToExcel } from "@/lib/utils/excel-export";
import { drawBarChartPng, drawDonutChartPng, drawMultiLineChartPng } from "@/lib/utils/canvas-chart";
import { clsx } from "clsx";
import { FileSpreadsheet, CalendarRange, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { scorePill } from "./team-performance-tab";
import { PipelineTargetTable, type PipelineTargetReport } from "./pipeline-target-widget";
import type { RecruiterScoreResult } from "@/lib/recruit/scoring";

interface ReportEventItem { id: string; candidateId: string; name: string; requisitionTitle: string; [k: string]: unknown }

interface RecruiterReportData {
  recruiter: { id: string; name: string };
  range: { from: string; to: string };
  interviews: { count: number; items: (ReportEventItem & { type: string; round: number; stageName: string; scheduledAt: string })[] };
  offers: { count: number; items: (ReportEventItem & { offerStatus: string | null; offerSentAt: string })[] };
  hires: { count: number; items: (ReportEventItem & { hiredAt: string })[] };
  timeToFill: { avgDays: number | null; medianDays: number | null; closedCount: number };
  timeToHire: { avgDays: number | null; medianDays: number | null };
  positionToOfferTat: { inTat: number; missed: number; notRated: number; sampleSize: number };
  sourcedToInterviewTat: { inTat: number; missed: number; notRated: number; sampleSize: number };
  positionsClosed: { count: number; avgTimeToCloseDays: number | null };
  positionsClosedByRequisition: { requisitionTitle: string; count: number }[];
  escalations: number;
  escalationsDetail: { id: string; title: string; message: string; requisitionTitle: string; createdAt: string }[];
  dateRevisions: number;
  dateRevisionsDetail: { requisitionTitle: string; detail: string; createdAt: string }[];
  requisitions: { id: string; title: string; requisitionNumber: string; status: string; positions: number; filledPositions: number }[];
  positions: { id: string; positionCode: string; requisitionTitle: string; status: string; assignedAt: string | null; filledAt: string | null }[];
  allCandidates: { id: string; candidateId: string; name: string; requisitionTitle: string; status: string; currentStage: string | null; appliedDate: string }[];
  trend: { bucket: string; interviews: number; offers: number; hires: number }[];
  score: RecruiterScoreResult;
  pipelineTargets: PipelineTargetReport;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoMondayOfThisWeek(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
}
function isoSundayOfThisWeek(): string {
  const d = new Date(isoMondayOfThisWeek());
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** TAT tally badge — completed-event based (no live "at risk" bucket, unlike the dashboard's real-time badges), since a report only counts what already happened inside the window. */
function tatTallyBadge(inTat: number, missed: number, notRated: number) {
  const total = inTat + missed + notRated;
  if (total === 0) return <span className="text-gray-400 text-[11px]">No events in range</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {inTat > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 bg-green-50 text-green-700 ring-green-200">{inTat} In TAT</span>}
      {missed > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 bg-red-50 text-red-700 ring-red-200">{missed} Missed</span>}
      {notRated > 0 && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 bg-gray-50 text-gray-500 ring-gray-200">{notRated} Not rated</span>}
    </div>
  );
}

/** Single recruiter, arbitrary date-range report — Daily/Weekly/Custom — with an Excel export (data + static chart pictures). Sits above the Recruitment Pipeline Summary table on the "My Home" tab. */
export function RecruiterReportPanel({ recruiters }: { recruiters: { employeeId: string; name: string }[] }) {
  const api = useApiClient();
  const toast = useToast();
  const [recruiterId, setRecruiterId] = useState("");
  const [mode, setMode] = useState<"daily" | "weekly" | "custom">("weekly");
  const [from, setFrom] = useState(isoMondayOfThisWeek());
  const [to, setTo] = useState(isoSundayOfThisWeek());
  const [trigger, setTrigger] = useState<{ recruiterId: string; from: string; to: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [openSection, setOpenSection] = useState<"requisitions" | "candidates" | "escalations" | "revisions" | null>(null);
  const toggleSection = (s: typeof openSection) => setOpenSection((cur) => (cur === s ? null : s));

  const setModeAndDates = (m: "daily" | "weekly" | "custom") => {
    setMode(m);
    if (m === "daily") { setFrom(isoToday()); setTo(isoToday()); }
    else if (m === "weekly") { setFrom(isoMondayOfThisWeek()); setTo(isoSundayOfThisWeek()); }
  };

  const { data, isFetching } = useQuery({
    queryKey: ["recruiter-report", trigger?.recruiterId, trigger?.from, trigger?.to],
    queryFn: () => api.get<RecruiterReportData>(`/api/v1/hrms/recruit/recruiter-report?recruiterId=${trigger!.recruiterId}&from=${trigger!.from}&to=${trigger!.to}`),
    enabled: !!trigger,
  });
  const report = data?.data;

  const generate = () => {
    if (!recruiterId) { toast.error("Pick a recruiter first."); return; }
    if (!from || !to || from > to) { toast.error("Pick a valid date range."); return; }
    setTrigger({ recruiterId, from, to });
  };

  const tatChartData = report ? [
    { name: "Pos→Offer In TAT", value: report.positionToOfferTat.inTat },
    { name: "Pos→Offer Missed", value: report.positionToOfferTat.missed },
    { name: "Sourced→Int In TAT", value: report.sourcedToInterviewTat.inTat },
    { name: "Sourced→Int Missed", value: report.sourcedToInterviewTat.missed },
  ].filter((d) => d.value > 0) : [];
  const activityChartData = report ? [
    { name: "Interviews", value: report.interviews.count },
    { name: "Offers", value: report.offers.count },
    { name: "Hires", value: report.hires.count },
  ] : [];

  const slaDonutData = (tat: { inTat: number; missed: number; notRated: number }) =>
    [{ name: "In TAT", value: tat.inTat }, { name: "Missed", value: tat.missed }, { name: "Not Rated", value: tat.notRated }].filter((d) => d.value > 0);
  const SLA_COLORS = ["#22c55e", "#ef4444", "#94a3b8"];
  const posOfferSlaData = report ? slaDonutData(report.positionToOfferTat) : [];
  const sourcedIntSlaData = report ? slaDonutData(report.sourcedToInterviewTat) : [];

  const reqClosedBarData = report ? report.positionsClosedByRequisition.map((r) => ({ name: r.requisitionTitle, value: r.count })) : [];

  const TREND_SERIES = [
    { key: "interviews", label: "Interviews", color: "#0ea5e9" },
    { key: "offers", label: "Offers", color: "#f59e0b" },
    { key: "hires", label: "Hires", color: "#16a34a" },
  ];
  const trendData = report ? report.trend.map((t) => ({ name: t.bucket, interviews: t.interviews, offers: t.offers, hires: t.hires })) : [];
  const hasTrendActivity = trendData.some((t) => t.interviews > 0 || t.offers > 0 || t.hires > 0);

  const exportExcel = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const charts: { title: string; dataUrl: string; width: number; height: number }[] = [];
      if (hasTrendActivity) charts.push({ title: "Interviews / Offers / Hires Trend", ...drawMultiLineChartPng(trendData, TREND_SERIES) });
      if (tatChartData.length > 0) charts.push({ title: "Pos→Offer / Sourced→Int TAT", ...drawBarChartPng(tatChartData, { color: "#8b5cf6" }) });
      if (activityChartData.some((d) => d.value > 0)) charts.push({ title: "Interviews / Offers / Hires", ...drawDonutChartPng(activityChartData, { colors: ["#0ea5e9", "#f59e0b", "#16a34a"] }) });
      if (posOfferSlaData.length > 0) charts.push({ title: "Pos→Offer SLA Status", ...drawDonutChartPng(posOfferSlaData, { colors: SLA_COLORS }) });
      if (sourcedIntSlaData.length > 0) charts.push({ title: "Sourced→Int SLA Status", ...drawDonutChartPng(sourcedIntSlaData, { colors: SLA_COLORS }) });
      if (reqClosedBarData.length > 0) charts.push({ title: "Positions Closed by Requisition", ...drawBarChartPng(reqClosedBarData, { color: "#6366f1" }) });

      await exportRecruiterReportToExcel({
        filename: `recruiter-report-${report.recruiter.name.replace(/\s+/g, "-").toLowerCase()}-${report.range.from}-to-${report.range.to}`,
        recruiterName: report.recruiter.name,
        range: report.range,
        summary: [
          { label: "Interviews", value: String(report.interviews.count) },
          { label: "Offers", value: String(report.offers.count) },
          { label: "Hires", value: String(report.hires.count) },
          { label: "SLA Score", value: report.score.overallScore != null ? `${report.score.overallScore} (${report.score.band}) — ${report.score.scoredKpiCount} of ${report.score.totalKpiCount} KPIs` : "Insufficient data" },
          { label: "Pos→Offer TAT", value: `${report.positionToOfferTat.inTat} In TAT, ${report.positionToOfferTat.missed} Missed, ${report.positionToOfferTat.notRated} Not rated` },
          { label: "Sourced→Int TAT", value: `${report.sourcedToInterviewTat.inTat} In TAT, ${report.sourcedToInterviewTat.missed} Missed, ${report.sourcedToInterviewTat.notRated} Not rated` },
          { label: "Avg Time-to-Fill", value: report.timeToFill.avgDays != null ? `${report.timeToFill.avgDays}d (median ${report.timeToFill.medianDays ?? "—"}d, ${report.timeToFill.closedCount} closed)` : "No requisitions closed in range" },
          { label: "Avg Time-to-Hire", value: report.timeToHire.avgDays != null ? `${report.timeToHire.avgDays}d (median ${report.timeToHire.medianDays ?? "—"}d)` : "No hires in range" },
          { label: "Positions Closed", value: `${report.positionsClosed.count}${report.positionsClosed.avgTimeToCloseDays != null ? ` (avg ${report.positionsClosed.avgTimeToCloseDays}d to close)` : ""}` },
          { label: "Escalations", value: String(report.escalations) },
          { label: "Date Revisions", value: String(report.dateRevisions) },
        ],
        sheets: [
          {
            name: "Interviews", columns: [
              { header: "Candidate", key: "name" }, { header: "Requisition", key: "requisitionTitle" },
              { header: "Type", key: "type" }, { header: "Stage", key: "stageName", width: 16 }, { header: "Scheduled At", key: "scheduledAt", width: 22 },
            ],
            rows: report.interviews.items.map((iv) => ({ name: iv.name, requisitionTitle: iv.requisitionTitle, type: iv.type, stageName: iv.stageName, scheduledAt: fmtDateTime(iv.scheduledAt) })),
          },
          {
            name: "Offers", columns: [
              { header: "Candidate", key: "name" }, { header: "Requisition", key: "requisitionTitle" },
              { header: "Status", key: "offerStatus" }, { header: "Offer Sent At", key: "offerSentAt", width: 22 },
            ],
            rows: report.offers.items.map((o) => ({ name: o.name, requisitionTitle: o.requisitionTitle, offerStatus: o.offerStatus ?? "—", offerSentAt: fmtDateTime(o.offerSentAt) })),
          },
          {
            name: "Hires", columns: [
              { header: "Candidate", key: "name" }, { header: "Requisition", key: "requisitionTitle" }, { header: "Hired At", key: "hiredAt", width: 22 },
            ],
            rows: report.hires.items.map((h) => ({ name: h.name, requisitionTitle: h.requisitionTitle, hiredAt: fmtDateTime(h.hiredAt) })),
          },
          {
            name: "Requisitions", columns: [
              { header: "Title", key: "title" }, { header: "Number", key: "requisitionNumber" }, { header: "Status", key: "status" },
              { header: "Positions", key: "positions", width: 10 }, { header: "Filled", key: "filledPositions", width: 10 },
            ],
            rows: report.requisitions.map((r) => ({ title: r.title, requisitionNumber: r.requisitionNumber, status: r.status, positions: r.positions, filledPositions: r.filledPositions })),
          },
          {
            name: "Positions", columns: [
              { header: "Position Code", key: "positionCode" }, { header: "Requisition", key: "requisitionTitle" }, { header: "Status", key: "status" },
              { header: "Assigned At", key: "assignedAt", width: 22 }, { header: "Filled At", key: "filledAt", width: 22 },
            ],
            rows: report.positions.map((p) => ({ positionCode: p.positionCode, requisitionTitle: p.requisitionTitle, status: p.status, assignedAt: p.assignedAt ? fmtDateTime(p.assignedAt) : "—", filledAt: p.filledAt ? fmtDateTime(p.filledAt) : "—" })),
          },
          {
            name: "All Candidates", columns: [
              { header: "Candidate", key: "name" }, { header: "Requisition", key: "requisitionTitle" }, { header: "Status", key: "status" },
              { header: "Stage", key: "currentStage" }, { header: "Applied Date", key: "appliedDate", width: 22 },
            ],
            rows: report.allCandidates.map((c) => ({ name: c.name, requisitionTitle: c.requisitionTitle, status: c.status, currentStage: c.currentStage ?? "—", appliedDate: fmtDateTime(c.appliedDate) })),
          },
          {
            name: "Escalations", columns: [
              { header: "Title", key: "title" }, { header: "Requisition", key: "requisitionTitle" }, { header: "Message", key: "message", width: 40 }, { header: "Date", key: "createdAt", width: 22 },
            ],
            rows: report.escalationsDetail.map((e) => ({ title: e.title, requisitionTitle: e.requisitionTitle, message: e.message, createdAt: fmtDateTime(e.createdAt) })),
          },
          {
            name: "Date Revisions", columns: [
              { header: "Requisition", key: "requisitionTitle" }, { header: "Detail", key: "detail" }, { header: "Date", key: "createdAt", width: 22 },
            ],
            rows: report.dateRevisionsDetail.map((d) => ({ requisitionTitle: d.requisitionTitle, detail: d.detail, createdAt: fmtDateTime(d.createdAt) })),
          },
          {
            name: "Pipeline Targets", columns: [
              { header: "Job Level", key: "level" }, { header: "Stage", key: "stage" },
              { header: "Target / Day", key: "targetPerDay", width: 12 }, { header: "Total Target", key: "totalTarget", width: 12 },
              { header: "Actual", key: "actual", width: 10 }, { header: "Achievement %", key: "achievementPct", width: 14 },
            ],
            rows: report.pipelineTargets.rows.filter((r) => r.targetPerDay != null).map((r) => ({
              level: `${r.levelCode} — ${r.levelName}`, stage: r.stage.replace(/([a-z])([A-Z])/g, "$1 $2"),
              targetPerDay: r.targetPerDay, totalTarget: r.totalTarget, actual: r.actual,
              achievementPct: r.achievementPct != null ? `${r.achievementPct}%` : "—",
            })),
          },
        ],
        charts,
      });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the Excel report.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarRange size={16} className="text-accent-600" />
        <h2 className="text-[13px] font-bold text-gray-800">Recruiter Report</h2>
        <p className="text-[11px] text-gray-400">Pick a recruiter and a date range to see exactly what happened in that window.</p>
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-56">
          <label className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400 block mb-1">Recruiter</label>
          <Select value={recruiterId} onChange={setRecruiterId} placeholder="Select recruiter"
            options={recruiters.map((r) => ({ value: r.employeeId, label: r.name }))} />
        </div>

        <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1">
          {(["daily", "weekly", "custom"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setModeAndDates(m)}
              className={clsx("px-3 py-1.5 text-[11px] font-semibold rounded-md capitalize transition",
                mode === m ? "bg-accent-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700")}>
              {m}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <input type="date" value={from} disabled={mode !== "custom"} onChange={(e) => setFrom(e.target.value)}
            className="border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs disabled:bg-gray-50 disabled:text-gray-400" />
          <span className="text-gray-400 text-xs">to</span>
          <input type="date" value={to} disabled={mode !== "custom"} onChange={(e) => setTo(e.target.value)}
            className="border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs disabled:bg-gray-50 disabled:text-gray-400" />
        </div>

        <button type="button" onClick={generate} disabled={isFetching}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-accent-600 hover:bg-accent-700 text-white rounded-lg shadow-sm disabled:opacity-60">
          {isFetching ? <Loader2 size={13} className="animate-spin" /> : <CalendarRange size={13} />} Generate Report
        </button>

        {report && (
          <button type="button" onClick={exportExcel} disabled={exporting}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg disabled:opacity-60">
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />} Export Excel
          </button>
        )}
      </div>

      {report && (
        <div className="space-y-3 pt-1 border-t border-gray-100">
          <p className="text-[11px] text-gray-400">
            <span className="font-semibold text-gray-600">{report.recruiter.name}</span> · {fmtDate(`${report.range.from}T00:00:00`)} – {fmtDate(`${report.range.to}T00:00:00`)} · every number below is activity that happened inside this window, not a live snapshot.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { l: "Interviews", v: report.interviews.count },
              { l: "Offers", v: report.offers.count },
              { l: "Hires", v: report.hires.count },
              { l: "Positions Closed", v: report.positionsClosed.count },
              { l: "Escalations", v: report.escalations },
              { l: "Date Revisions", v: report.dateRevisions },
            ].map((t) => (
              <div key={t.l} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-lg font-bold text-gray-900 leading-none">{t.v}</div>
                <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400 mt-1">{t.l}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400 mb-1">Avg Time-to-Fill</div>
              <div className="text-base font-bold text-gray-900">{report.timeToFill.avgDays != null ? `${report.timeToFill.avgDays}d` : "—"}</div>
              <div className="text-[10.5px] text-gray-400">{report.timeToFill.avgDays != null ? `Median ${report.timeToFill.medianDays}d · ${report.timeToFill.closedCount} closed in range` : "No requisitions closed in range"}</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400 mb-1">Avg Time-to-Hire</div>
              <div className="text-base font-bold text-gray-900">{report.timeToHire.avgDays != null ? `${report.timeToHire.avgDays}d` : "—"}</div>
              <div className="text-[10.5px] text-gray-400">{report.timeToHire.avgDays != null ? `Median ${report.timeToHire.medianDays}d` : "No hires in range"}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Pos→Offer TAT</div>
              {tatTallyBadge(report.positionToOfferTat.inTat, report.positionToOfferTat.missed, report.positionToOfferTat.notRated)}
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Sourced→Int TAT</div>
              {tatTallyBadge(report.sourcedToInterviewTat.inTat, report.sourcedToInterviewTat.missed, report.sourcedToInterviewTat.notRated)}
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">SLA Score</div>
            {scorePill(report.score)}
            <p className="text-[10.5px] text-gray-400 mt-1">Hiring Output isn&apos;t scored here — it needs a team-wide comparison for the same window, which the live dashboard&apos;s Score does have.</p>
          </div>

          <PipelineTargetTable report={report.pipelineTargets} from={report.range.from} to={report.range.to} title="Pipeline Activity — this range" />

          {hasTrendActivity && (
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-[11px] font-semibold text-gray-700 mb-1">Interviews / Offers / Hires Trend</div>
              <MultiLineChartView data={trendData} series={TREND_SERIES} height={180} />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-[11px] font-semibold text-gray-700 mb-1">TAT breakdown</div>
              {tatChartData.length > 0 ? <BarChartView data={tatChartData} height={180} layout="vertical" color="#8b5cf6" showValues /> : <p className="text-[11px] text-gray-400 py-8 text-center">No TAT events in range.</p>}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-[11px] font-semibold text-gray-700 mb-1">Interviews / Offers / Hires</div>
              {activityChartData.some((d) => d.value > 0) ? <DonutView data={activityChartData} height={180} colors={["#0ea5e9", "#f59e0b", "#16a34a"]} /> : <p className="text-[11px] text-gray-400 py-8 text-center">No activity in range.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-[11px] font-semibold text-gray-700 mb-1">Pos→Offer SLA Status</div>
              {posOfferSlaData.length > 0 ? <DonutView data={posOfferSlaData} height={160} colors={SLA_COLORS} /> : <p className="text-[11px] text-gray-400 py-8 text-center">No data.</p>}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-[11px] font-semibold text-gray-700 mb-1">Sourced→Int SLA Status</div>
              {sourcedIntSlaData.length > 0 ? <DonutView data={sourcedIntSlaData} height={160} colors={SLA_COLORS} /> : <p className="text-[11px] text-gray-400 py-8 text-center">No data.</p>}
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="text-[11px] font-semibold text-gray-700 mb-1">Positions Closed by Requisition</div>
              {reqClosedBarData.length > 0 ? <BarChartView data={reqClosedBarData} height={160} layout="vertical" color="#6366f1" showValues /> : <p className="text-[11px] text-gray-400 py-8 text-center">No positions closed in range.</p>}
            </div>
          </div>

          {/* Full A-Z detail — collapsed by default so the report stays scannable; every list here is also in the Excel export in full. */}
          <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
            <ReportSection title={`Requisitions & Positions (${report.requisitions.length} req · ${report.positions.length} positions)`}
              open={openSection === "requisitions"} onToggle={() => toggleSection("requisitions")}>
              <div className="space-y-3">
                <div className="overflow-x-auto rounded-md border border-gray-100">
                  <table className="w-full text-[11px]">
                    <thead className="bg-gray-50 text-[9.5px] uppercase tracking-wide text-gray-400">
                      <tr>
                        <th className="text-left px-2.5 py-1.5">Requisition</th><th className="text-left px-2.5 py-1.5">Status</th>
                        <th className="text-right px-2.5 py-1.5">Positions</th><th className="text-right px-2.5 py-1.5">Filled</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.requisitions.map((r) => (
                        <tr key={r.id}>
                          <td className="px-2.5 py-1.5"><Link href={`/recruit/requisitions?view=${r.id}`} className="font-medium text-gray-800 hover:text-accent-700 hover:underline">{r.title}</Link> <span className="text-gray-400 font-mono">{r.requisitionNumber}</span></td>
                          <td className="px-2.5 py-1.5 text-gray-500">{r.status.replace("Req", "")}</td>
                          <td className="px-2.5 py-1.5 text-right tabular-nums">{r.positions}</td>
                          <td className="px-2.5 py-1.5 text-right tabular-nums">{r.filledPositions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="overflow-x-auto rounded-md border border-gray-100">
                  <table className="w-full text-[11px]">
                    <thead className="bg-gray-50 text-[9.5px] uppercase tracking-wide text-gray-400">
                      <tr>
                        <th className="text-left px-2.5 py-1.5">Position</th><th className="text-left px-2.5 py-1.5">Requisition</th>
                        <th className="text-left px-2.5 py-1.5">Status</th><th className="text-left px-2.5 py-1.5">Assigned</th><th className="text-left px-2.5 py-1.5">Filled</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.positions.map((p) => (
                        <tr key={p.id}>
                          <td className="px-2.5 py-1.5 font-mono text-gray-700">{p.positionCode}</td>
                          <td className="px-2.5 py-1.5 text-gray-600">{p.requisitionTitle}</td>
                          <td className="px-2.5 py-1.5 text-gray-500">{p.status}</td>
                          <td className="px-2.5 py-1.5 text-gray-500">{p.assignedAt ? fmtDate(p.assignedAt) : "—"}</td>
                          <td className="px-2.5 py-1.5 text-gray-500">{p.filledAt ? fmtDate(p.filledAt) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </ReportSection>

            <ReportSection title={`All Candidates (${report.allCandidates.length})`}
              open={openSection === "candidates"} onToggle={() => toggleSection("candidates")}>
              <div className="overflow-x-auto rounded-md border border-gray-100 max-h-72 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50 text-[9.5px] uppercase tracking-wide text-gray-400 sticky top-0">
                    <tr>
                      <th className="text-left px-2.5 py-1.5">Candidate</th><th className="text-left px-2.5 py-1.5">Requisition</th>
                      <th className="text-left px-2.5 py-1.5">Status</th><th className="text-left px-2.5 py-1.5">Stage</th><th className="text-left px-2.5 py-1.5">Applied</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {report.allCandidates.map((c) => (
                      <tr key={c.id}>
                        <td className="px-2.5 py-1.5"><Link href={`/recruit/candidates/${c.candidateId}`} className="font-medium text-gray-800 hover:text-accent-700 hover:underline">{c.name}</Link></td>
                        <td className="px-2.5 py-1.5 text-gray-600">{c.requisitionTitle}</td>
                        <td className="px-2.5 py-1.5 text-gray-500">{c.status.replace("App", "")}</td>
                        <td className="px-2.5 py-1.5 text-gray-500">{c.currentStage ?? "—"}</td>
                        <td className="px-2.5 py-1.5 text-gray-500">{fmtDate(c.appliedDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ReportSection>

            <ReportSection title={`Escalations (${report.escalationsDetail.length})`}
              open={openSection === "escalations"} onToggle={() => toggleSection("escalations")}>
              {report.escalationsDetail.length === 0 ? <p className="text-[11px] text-gray-400">No escalations in range.</p> : (
                <div className="divide-y divide-gray-100 rounded-md border border-gray-100">
                  {report.escalationsDetail.map((e) => (
                    <div key={e.id} className="px-2.5 py-2 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-red-700">{e.title}</span>
                        <span className="text-gray-400">{fmtDate(e.createdAt)}</span>
                      </div>
                      <div className="text-gray-500 mt-0.5">{e.requisitionTitle} · {e.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </ReportSection>

            <ReportSection title={`Date Revisions (${report.dateRevisionsDetail.length})`}
              open={openSection === "revisions"} onToggle={() => toggleSection("revisions")}>
              {report.dateRevisionsDetail.length === 0 ? <p className="text-[11px] text-gray-400">No date revisions in range.</p> : (
                <div className="divide-y divide-gray-100 rounded-md border border-gray-100">
                  {report.dateRevisionsDetail.map((d, i) => (
                    <div key={i} className="px-2.5 py-2 text-[11px] flex items-center justify-between gap-2">
                      <span className="text-gray-700">{d.requisitionTitle} · {d.detail}</span>
                      <span className="text-gray-400 shrink-0">{fmtDate(d.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </ReportSection>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportSection({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-gray-50">
        <span className="text-[12px] font-semibold text-gray-800">{title}</span>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}
