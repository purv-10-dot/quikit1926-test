"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useApiClient } from "@/lib/hooks/use-api";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { LineChartView } from "@/components/hrms/charts";
import { clsx } from "clsx";
import {
  Briefcase, Users, Calendar, FileText, Award, Clock, Check, Send, TrendingUp, Percent, ListTree, UserCheck2, Activity,
} from "lucide-react";
import { PipelineTargetWidget } from "./pipeline-target-widget";
import { recruitAccentStyle } from "@/lib/theme/recruit-accent";

interface DashboardData {
  kpis: {
    openRequisitions: number; openPositions: number; inPipeline: number;
    interviewsThisWeek: number; offersOut: number; hiresMTD: number;
    avgTimeToHire: number; offersSentMTD: number; offersAcceptedMTD: number; acceptanceRate: number;
  };
  funnel: { stage: string; label: string; count: number }[];
  openReqAging: {
    id: string; title: string; requisitionNumber: string; recruiter: string; candidates: number; ageDays: number; etaDays: number; status: "on-track" | "aging" | "overdue";
    positions: number; onboarded: number; inOffer: number; stageCounts: Record<string, number>;
  }[];
  recruiterWorkload: { id: string; name: string; count: number }[];
  monthlyHires: { month: string; hires: number }[];
  activity: { type: "offer-accepted" | "offer-sent" | "interview"; name: string; detail: string; at: string }[];
}

const AGE_STYLE: Record<string, { bar: string; pill: string; label: string }> = {
  "on-track": { bar: "bg-green-500", pill: "bg-green-50 text-green-700 ring-green-200", label: "On track" },
  aging: { bar: "bg-amber-500", pill: "bg-amber-50 text-amber-700 ring-amber-200", label: "Aging" },
  overdue: { bar: "bg-red-500", pill: "bg-red-50 text-red-700 ring-red-200", label: "Overdue" },
};

function relativeTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < -1) return `in ${Math.abs(Math.floor(m / 60))}h`;
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Overview tab — hiring health across all open roles. Shown under the Recruitment Dashboard's "Company Dashboard" tab. */
export function CompanyDashboardTab() {
  const api = useApiClient();

  const { data, isLoading } = useQuery({
    queryKey: ["recruit-dashboard"],
    queryFn: () => api.get<DashboardData>("/api/v1/hrms/recruit/dashboard"),
    staleTime: 60_000,
  });
  const d = data?.data;

  const kpiTiles = d ? [
    { icon: <Briefcase size={16} />, n: d.kpis.openRequisitions, l: "Open Requisitions", sub: `${d.kpis.openPositions} positions`, href: "/recruit/requisitions?status=ReqOpen", bg: "bg-green-50", fg: "text-green-600" },
    { icon: <Users size={16} />, n: d.kpis.inPipeline, l: "In Pipeline", href: "/recruit/pipeline", bg: "bg-purple-50", fg: "text-purple-600" },
    { icon: <Calendar size={16} />, n: d.kpis.interviewsThisWeek, l: "Interviews / week", bg: "bg-sky-50", fg: "text-sky-600" },
    { icon: <FileText size={16} />, n: d.kpis.offersOut, l: "Offers Out", href: "/recruit/pipeline?stage=Offer", bg: "bg-amber-50", fg: "text-amber-600" },
    { icon: <Award size={16} />, n: d.kpis.hiresMTD, l: "Hires (this month)", bg: "bg-orange-50", fg: "text-orange-600" },
    { icon: <Clock size={16} />, n: d.kpis.avgTimeToHire, l: "Avg Time-to-Hire", suffix: "d", bg: "bg-teal-50", fg: "text-teal-600" },
  ] : [];

  return (
    <div className="space-y-4" style={recruitAccentStyle}>
      {isLoading || !d ? (
        <SkeletonCards count={6} />
      ) : (
        <>
          {/* KPI tiles — same tile pattern as the "My Home" tab (colored icon square, bold number, uppercase label, caption row). */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {kpiTiles.map((k) => {
              const cls = clsx(
                "rounded-xl shadow-sm border border-gray-200 bg-white p-3.5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
                k.href && "hover:border-accent-200 cursor-pointer",
              );
              const body = (
                <>
                  <div className="flex items-center gap-3">
                    <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", k.bg, k.fg)}>{k.icon}</div>
                    <div className="min-w-0">
                      <div className="text-lg font-bold leading-none text-gray-900 tabular-nums">
                        {k.n}{k.suffix && <span className="text-sm font-semibold">{k.suffix}</span>}
                      </div>
                      <div className="text-[10.5px] font-bold uppercase tracking-wide mt-1 text-gray-400">{k.l}</div>
                    </div>
                  </div>
                  {k.sub && <div className="text-[10.5px] font-medium mt-2 text-gray-400">{k.sub}</div>}
                </>
              );
              return k.href ? (
                <Link key={k.l} href={k.href} className={cls}>{body}</Link>
              ) : (
                <div key={k.l} className={cls}>{body}</div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Hires per month */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 p-4">
              <h2 className="text-[13px] font-bold text-gray-900 mb-1 flex items-center gap-1.5"><TrendingUp size={14} className="text-accent-600" /> Hires per Month</h2>
              <p className="text-[11px] text-gray-400 mb-2">Last 6 months.</p>
              <LineChartView data={d.monthlyHires.map((m) => ({ name: m.month, value: m.hires }))} height={190} color="var(--accent-600)" />
            </div>

            {/* Offers & time-to-hire */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200">
              <h2 className="text-[13px] font-bold text-gray-900 px-4 pt-4 flex items-center gap-1.5"><Percent size={14} className="text-accent-600" /> Offers &amp; time-to-hire</h2>
              <div className="p-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Stat n={d.kpis.offersSentMTD} l="Offers sent" />
                <Stat n={d.kpis.offersAcceptedMTD} l="Accepted" />
                <div className="col-span-2 sm:col-span-1 bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-3">
                  <div className="relative grid place-items-center shrink-0">
                    <div className="w-14 h-14 rounded-full" style={{ background: `conic-gradient(var(--accent-600) ${d.kpis.acceptanceRate}%, var(--accent-100) 0)` }} />
                    <div className="absolute w-9 h-9 rounded-full bg-white grid place-items-center text-[11px] font-extrabold text-gray-900 tabular-nums">{d.kpis.acceptanceRate}%</div>
                  </div>
                  <div className="text-[11px] text-gray-500 font-semibold leading-tight">Acceptance rate</div>
                </div>
                <Stat n={`${d.kpis.avgTimeToHire}d`} l="Avg time-to-hire" />
                <Stat n={d.kpis.hiresMTD} l="Hires this month" />
              </div>
            </div>
          </div>

          <PipelineTargetWidget title="Pipeline Activity — Company-wide" />

          {/* Open requisitions & aging */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
            <div className="px-4 pt-4 pb-3 flex items-center gap-2">
              <h2 className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5"><ListTree size={14} className="text-accent-600" /> Open requisitions &amp; aging</h2>
              <span className="ml-auto text-[11.5px] text-gray-400">{d.kpis.openRequisitions} open · {d.kpis.openPositions} positions</span>
            </div>
            {d.openReqAging.length === 0 ? (
              <div className="px-4 pb-6 text-sm text-gray-400 text-center">No open requisitions.</div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-[12.5px]">
                <thead className="sticky top-0 z-10 bg-accent-50">
                  <tr className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-gray-500 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5">Requisition</th>
                    <th className="text-left px-4 py-2.5">Recruiter</th>
                    <th className="text-right px-4 py-2.5">Candidates</th>
                    <th className="text-left px-4 py-2.5 w-[220px]">Age</th>
                    <th className="text-right px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.openReqAging.map((r) => {
                    const s = AGE_STYLE[r.status];
                    const pct = Math.min(100, r.etaDays > 0 ? (r.ageDays / r.etaDays) * 100 : 100);
                    return (
                      <tr key={r.id} className="border-b border-gray-100 last:border-none hover:bg-gray-50/60">
                        <td className="px-4 py-2.5">
                          <Link href="/recruit/requisitions" className="font-semibold text-gray-900 hover:text-accent-700 hover:underline">{r.title}</Link>
                          <div className="text-[11px] text-gray-400 tabular-nums">{r.requisitionNumber}</div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">{r.recruiter}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900">{r.candidates}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-gray-500 tabular-nums">{r.ageDays} days</span>
                          <span className="block h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden">
                            <span className={clsx("block h-full rounded-full", s.bar)} style={{ width: `${pct}%` }} />
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1", s.pill)}>{s.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recruiter workload */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200">
              <div className="px-4 pt-4 pb-1 flex items-center gap-2">
                <h2 className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5"><UserCheck2 size={14} className="text-accent-600" /> Recruiter workload</h2>
                <span className="ml-auto text-[11.5px] text-gray-400">active candidates</span>
              </div>
              <div className="p-4 space-y-2.5">
                {d.recruiterWorkload.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No active candidates.</p>
                ) : (() => {
                  const max = Math.max(1, ...d.recruiterWorkload.map((r) => r.count));
                  return d.recruiterWorkload.map((r) => (
                    <div key={r.id} className="grid grid-cols-[130px_1fr_44px] items-center gap-2.5">
                      <span className="text-[12.5px] font-medium text-gray-700 truncate">{r.name}</span>
                      <span className="h-2 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full bg-accent-600 rounded-full" style={{ width: `${(r.count / max) * 100}%` }} /></span>
                      <span className="text-[12px] font-bold text-gray-900 text-right tabular-nums">{r.count}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Recent activity */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200">
              <h2 className="text-[13px] font-bold text-gray-900 px-4 pt-4 flex items-center gap-1.5"><Activity size={14} className="text-accent-600" /> Recent activity</h2>
              <div className="p-4 pt-2">
                {d.activity.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No recent activity.</p>
                ) : d.activity.map((a, i) => {
                  const meta = a.type === "offer-accepted"
                    ? { bg: "bg-green-50 text-green-700", icon: <Check size={14} /> }
                    : a.type === "offer-sent"
                      ? { bg: "bg-amber-50 text-amber-700", icon: <Send size={14} /> }
                      : { bg: "bg-emerald-50 text-emerald-700", icon: <Calendar size={14} /> };
                  return (
                    <div key={i} className="flex gap-3 py-2 border-b border-gray-100 last:border-none">
                      <span className={clsx("w-7 h-7 rounded-lg grid place-items-center shrink-0", meta.bg)}>{meta.icon}</span>
                      <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold text-gray-900 truncate">{a.name}</div>
                        <div className="text-[11px] text-gray-400">{a.detail} · {relativeTime(a.at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ n, l }: { n: number | string; l: string }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
      <div className="text-xl font-extrabold text-gray-900 tabular-nums">{n}</div>
      <div className="text-[11px] text-gray-500 font-semibold mt-0.5">{l}</div>
    </div>
  );
}
