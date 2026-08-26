"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { clsx } from "clsx";
import { Target } from "lucide-react";
// The SAME stage → label mapping the actual Hiring Pipeline board uses (e.g.
// raw "Screening" displays as "Source", "HRInterview" as "HR Interview") —
// a local naive camelCase-splitter here previously showed raw stage keys
// verbatim, and a later attempt borrowed a DIFFERENT relabeling used only by
// the KPI-tile funnel (e.g. "Sourced", "Manager Round"), which doesn't match
// the pipeline board either. This is the canonical one, shared with it.
import { prettyStage } from "@/lib/services/pipeline-stages";

export interface PipelineTargetRow {
  levelId: string;
  levelCode: string;
  levelName: string;
  stage: string;
  targetPerDay: number | null;
  totalTarget: number | null;
  actual: number;
  achievementPct: number | null;
}
export interface PipelineTargetReport {
  stages: string[];
  rows: PipelineTargetRow[];
  daysInRange: number;
}

function achievementTone(pct: number | null): string {
  if (pct == null) return "text-gray-300";
  if (pct >= 100) return "text-green-600";
  if (pct >= 50) return "text-amber-600";
  return "text-red-600";
}

/**
 * Pure presentational target-vs-actual grid — takes an already-fetched
 * report (used by the Recruiter Report, which fetches its own date-range
 * data server-side alongside everything else). For a self-fetching version
 * that drops straight into a dashboard, use `PipelineTargetWidget` below.
 * Renders nothing if no Job Level has any target configured yet, rather
 * than showing an empty/all-blank grid.
 */
export function PipelineTargetTable({ report, from, to, title }: {
  report: PipelineTargetReport;
  from: string;
  to: string;
  title?: string;
}) {
  // Show every level/stage that has a target NUMBER configured (regardless
  // of current open-req count) — so a configured level never just vanishes.
  // A level resolves to totalTarget 0 when it has zero currently-OPEN
  // requisitions (target scales by open-requisition count) — that's a
  // separate, per-cell "nothing to measure right now" state, handled below.
  const isConfigured = (r: PipelineTargetRow) => r.targetPerDay != null;
  const hasOpenWork = (r: PipelineTargetRow) => r.totalTarget != null && r.totalTarget > 0;
  const levelIds = [...new Set(report.rows.filter(isConfigured).map((r) => r.levelId))];
  if (levelIds.length === 0) return null;
  const levels = levelIds.map((id) => {
    const r = report.rows.find((x) => x.levelId === id)!;
    return { id, code: r.levelCode, name: r.levelName };
  });
  // A stage row shows if any included level has a target for it OR real
  // activity happened there — a stage nobody set a benchmark for still had
  // candidates move through it today, and hiding that made the widget look
  // like it disagreed with the actual Hiring Pipeline board.
  const stages = report.stages.filter((s) =>
    report.rows.some((r) => levelIds.includes(r.levelId) && r.stage === s && (isConfigured(r) || r.actual > 0)),
  );
  const byLevelStage = new Map(report.rows.map((r) => [`${r.levelId}::${r.stage}`, r]));

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex items-center gap-2">
        <Target size={14} className="text-green-600" />
        <h2 className="text-[13px] font-bold text-gray-900">{title ?? "Pipeline Activity"}</h2>
        <span className="ml-auto text-[11.5px] text-gray-400">
          {from === to ? "Today" : `${from} → ${to}`} · target/day × {report.daysInRange}d
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-accent-50 text-[10.5px] uppercase tracking-wide text-gray-400">
            <tr>
              <th className="text-left px-4 py-1.5">Stage</th>
              {levels.map((l) => (
                <th key={l.id} className="text-center px-2 py-1.5 whitespace-nowrap" title={l.name}>{l.code}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {stages.map((stage) => (
              <tr key={stage}>
                <td className="px-4 py-1.5 font-medium text-gray-700 whitespace-nowrap">{prettyStage(stage)}</td>
                {levels.map((l) => {
                  const cell = byLevelStage.get(`${l.id}::${stage}`);
                  if (!cell) return <td key={l.id} className="px-2 py-1.5 text-center text-gray-300">—</td>;
                  if (!isConfigured(cell)) {
                    return (
                      <td key={l.id} className="px-2 py-1.5 text-center whitespace-nowrap">
                        {cell.actual > 0 ? (
                          <span className="text-gray-500 font-semibold tabular-nums" title="No target set for this stage yet — showing actual activity only">
                            {cell.actual}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    );
                  }
                  if (!hasOpenWork(cell)) {
                    return (
                      <td key={l.id} className="px-2 py-1.5 text-center text-gray-300 text-[10px] whitespace-nowrap" title="No open requisition at this level right now">
                        No open req
                      </td>
                    );
                  }
                  return (
                    <td key={l.id} className="px-2 py-1.5 text-center whitespace-nowrap">
                      <span className="text-gray-700 font-semibold tabular-nums">{cell.actual}</span>
                      <span className="text-gray-400">/{cell.totalTarget}</span>
                      <span className={clsx("ml-1.5 font-bold tabular-nums", achievementTone(cell.achievementPct))}>
                        {cell.achievementPct}%
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-[10.5px] text-gray-400 border-t border-gray-100">
        Minimum daily activity benchmark, not a hard rule &mdash; a low % may just mean genuinely few suitable candidates that day.
      </div>
    </div>
  );
}

/**
 * Self-fetching version — drops into the Company Dashboard (org-wide) or
 * Team Performance tab (recruiterId) with no extra wiring. Defaults to
 * today when no range is passed.
 */
export function PipelineTargetWidget({ recruiterId, from, to, title }: {
  recruiterId?: string;
  from?: string;
  to?: string;
  title?: string;
}) {
  const api = useApiClient();
  const { data, isLoading } = useQuery({
    queryKey: ["pipeline-target-report", recruiterId ?? "", from ?? "", to ?? ""],
    queryFn: () => api.get<PipelineTargetReport & { from: string; to: string }>(
      `/api/v1/hrms/recruit/pipeline-target-report${buildQuery({ recruiterId, from, to })}`,
    ),
    staleTime: 60_000,
  });
  const report = data?.data;
  if (isLoading || !report) return null;
  return <PipelineTargetTable report={report} from={report.from} to={report.to} title={title} />;
}

interface RecruiterPipelineTargetSummary {
  recruiterId: string;
  recruiterName: string;
  totalTarget: number;
  totalActual: number;
  achievementPct: number | null;
}

/**
 * All-recruiters-side-by-side comparison — one row per recruiter, one
 * overall Achievement% (summed across every stage/level they have a
 * target for). HR/Admin-only, same scope as the underlying API.
 */
export function PipelineTargetByRecruiterTable({ from, to, title }: { from?: string; to?: string; title?: string }) {
  const api = useApiClient();
  const { data, isLoading } = useQuery({
    queryKey: ["pipeline-target-report-by-recruiter", from ?? "", to ?? ""],
    queryFn: () => api.get<{ recruiters: RecruiterPipelineTargetSummary[]; from: string; to: string }>(
      `/api/v1/hrms/recruit/pipeline-target-report/by-recruiter${buildQuery({ from, to })}`,
    ),
    staleTime: 60_000,
  });
  const report = data?.data;
  if (isLoading || !report || report.recruiters.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex items-center gap-2">
        <Target size={14} className="text-green-600" />
        <h2 className="text-[13px] font-bold text-gray-900">{title ?? "Pipeline Activity by Recruiter"}</h2>
        <span className="ml-auto text-[11.5px] text-gray-400">
          {report.from === report.to ? "Today" : `${report.from} → ${report.to}`}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-accent-50 text-[10.5px] uppercase tracking-wide text-gray-400">
            <tr>
              <th className="text-left px-4 py-1.5">Recruiter</th>
              <th className="text-right px-2 py-1.5">Target</th>
              <th className="text-right px-2 py-1.5">Actual</th>
              <th className="text-right px-4 py-1.5">Achievement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.recruiters.map((r) => (
              <tr key={r.recruiterId}>
                <td className="px-4 py-1.5 font-medium text-gray-800">{r.recruiterName}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{r.totalTarget}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-gray-700 font-semibold">{r.totalActual}</td>
                <td className="px-4 py-1.5 text-right">
                  <span className={clsx("font-bold tabular-nums", achievementTone(r.achievementPct))}>
                    {r.achievementPct != null ? `${r.achievementPct}%` : "—"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 text-[10.5px] text-gray-400 border-t border-gray-100">
        Overall, across every stage/level each recruiter has a target for &mdash; a workload-adjusted total, not a per-stage breakdown.
      </div>
    </div>
  );
}

function buildQuery(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter((e): e is [string, string] => !!e[1]);
  if (entries.length === 0) return "";
  return "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}
