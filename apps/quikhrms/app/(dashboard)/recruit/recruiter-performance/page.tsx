"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { EmptyState } from "@/components/hrms/empty-state";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { Select } from "@/components/hrms/select";
import { clsx } from "clsx";
import { Briefcase, Users, Calendar, Send, Award, Clock, Target, ShieldCheck } from "lucide-react";

interface RecruiterRow {
  employeeId: string;
  name: string;
  activeRequisitions: number;
  positionsAssigned: number;
  activeCandidates: number;
  interviewsThisWeek: number;
  offersSentThisWeek: number;
  hiresThisMonth: number;
  avgTimeToFillDays: number | null;
  avgTimeToHireDays: number | null;
  slaOnTrack: number;
  slaAging: number;
  slaOverdue: number;
  slaCompliancePct: number | null;
}
interface PerfData {
  recruiters: RecruiterRow[];
  orgAverage: { avgTimeToFillDays: number | null; avgTimeToHireDays: number | null } | null;
  funnel: { stage: string; count: number }[];
  scope: "all" | "self";
}

const FUNNEL_COLORS = ["#4ade80", "#22c55e", "#16a34a", "#15803d", "#166534", "#14532d", "#052e16"];

function prettyStage(s: string): string {
  if (s === "Screening") return "Source";
  if (s === "HRInterview") return "HR Interview";
  return s.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function slaBadge(row: RecruiterRow) {
  if (row.slaCompliancePct == null) return <span className="text-gray-400 text-[11px]">—</span>;
  const tone = row.slaCompliancePct >= 90 ? "bg-green-50 text-green-700 ring-green-200"
    : row.slaCompliancePct >= 70 ? "bg-amber-50 text-amber-700 ring-amber-200"
    : "bg-red-50 text-red-700 ring-red-200";
  return (
    <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1", tone)}>
      {row.slaCompliancePct}%
    </span>
  );
}

export default function RecruiterPerformancePage() {
  const api = useApiClient();
  const { hasPermission, isLoading: permsLoading } = useDashboardConfig();
  const canSeeAll = hasPermission("hrms.recruit.performance.read");
  const canSeeSelf = canSeeAll || hasPermission("hrms.recruit.performance.read_self");
  const [recruiterFilter, setRecruiterFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["recruiter-performance", recruiterFilter],
    queryFn: () => api.get<PerfData>(`/api/v1/hrms/recruit/recruiter-performance${recruiterFilter ? `?recruiterId=${recruiterFilter}` : ""}`),
    enabled: canSeeSelf,
    staleTime: 60_000,
  });
  const d = data?.data;

  if (!permsLoading && !canSeeSelf) {
    return (
      <EmptyState
        variant="folder"
        title="You don't have access to Recruiter Performance"
        description="Contact your administrator if you need access."
      />
    );
  }

  const totals = d ? {
    activeReqs: d.recruiters.reduce((s, r) => s + r.activeRequisitions, 0),
    activeCandidates: d.recruiters.reduce((s, r) => s + r.activeCandidates, 0),
    hiresThisMonth: d.recruiters.reduce((s, r) => s + r.hiresThisMonth, 0),
  } : null;

  const funnelMax = Math.max(1, ...(d?.funnel.map((f) => f.count) ?? [1]));

  return (
    <div className="w-full px-5 py-4 space-y-4">
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-page-title text-gray-900">Recruiter Performance</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {d?.scope === "self" ? "Your workload and hiring performance." : "Workload, SLA and hiring performance across recruiters."}
          </p>
        </div>
        {canSeeAll && d && d.recruiters.length > 0 && (
          <div className="w-56">
            <Select value={recruiterFilter} onChange={setRecruiterFilter}
              placeholder="All recruiters"
              options={[{ value: "", label: "All recruiters" }, ...d.recruiters.map((r) => ({ value: r.employeeId, label: r.name }))]} />
          </div>
        )}
      </div>

      {isLoading ? <SkeletonCards count={4} /> : !d || d.recruiters.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          No recruiter activity yet — assign a recruiter to a requisition to see performance here.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: <Users size={16} />, n: d.recruiters.length, l: "Recruiters" },
              { icon: <Briefcase size={16} />, n: totals!.activeReqs, l: "Active Requisitions" },
              { icon: <Target size={16} />, n: totals!.activeCandidates, l: "Active Candidates" },
              { icon: <Award size={16} />, n: totals!.hiresThisMonth, l: "Hires (this month)" },
            ].map((k, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0">{k.icon}</div>
                <div>
                  <div className="text-lg font-bold text-gray-900 leading-none">{k.n}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{k.l}</div>
                </div>
              </div>
            ))}
          </div>

          {d.orgAverage && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3.5 flex items-center gap-6 text-xs text-gray-600">
              <span className="font-semibold text-gray-700">Org average:</span>
              <span className="flex items-center gap-1.5"><Clock size={13} className="text-gray-400" /> Time-to-Fill: <b>{d.orgAverage.avgTimeToFillDays ?? "—"}d</b></span>
              <span className="flex items-center gap-1.5"><Calendar size={13} className="text-gray-400" /> Time-to-Hire: <b>{d.orgAverage.avgTimeToHireDays ?? "—"}d</b></span>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-accent-50 text-[11px] uppercase tracking-wide text-gray-500">
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
                  <th className="text-right px-3 py-2">SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {d.recruiters.map((r) => (
                  <tr key={r.employeeId} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{r.name}</td>
                    <td className="px-3 py-2 text-right">{r.activeRequisitions}</td>
                    <td className="px-3 py-2 text-right">{r.positionsAssigned}</td>
                    <td className="px-3 py-2 text-right">{r.activeCandidates}</td>
                    <td className="px-3 py-2 text-right">{r.interviewsThisWeek}</td>
                    <td className="px-3 py-2 text-right">{r.offersSentThisWeek}</td>
                    <td className="px-3 py-2 text-right">{r.hiresThisMonth}</td>
                    <td className="px-3 py-2 text-right">{r.avgTimeToFillDays != null ? `${r.avgTimeToFillDays}d` : "—"}</td>
                    <td className="px-3 py-2 text-right">{r.avgTimeToHireDays != null ? `${r.avgTimeToHireDays}d` : "—"}</td>
                    <td className="px-3 py-2 text-right">{slaBadge(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {d.funnel.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <h2 className="text-[13px] font-semibold text-gray-900 mb-3 flex items-center gap-1.5"><ShieldCheck size={14} className="text-green-600" /> Candidate Funnel</h2>
              <div className="space-y-2">
                {d.funnel.map((f, i) => (
                  <div key={f.stage} className="flex items-center gap-3">
                    <span className="w-32 text-[11px] text-gray-600 shrink-0">{prettyStage(f.stage)}</span>
                    <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${(f.count / funnelMax) * 100}%`, background: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} />
                    </div>
                    <span className="w-8 text-right text-[11px] font-semibold text-gray-700">{f.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <Send size={12} /> Candidate-level activity is attributed to each requisition's primary recruiter — precise per-candidate attribution for split requisitions lands in a later phase.
          </div>
        </>
      )}
    </div>
  );
}
