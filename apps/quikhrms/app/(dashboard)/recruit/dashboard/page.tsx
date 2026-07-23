"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { EmptyState } from "@/components/hrms/empty-state";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { clsx } from "clsx";
import {
  Briefcase, Users, Calendar, FileText, Award, Clock, Check, Send, UserPlus, TrendingUp,
} from "lucide-react";

interface DashboardData {
  kpis: {
    openRequisitions: number; openPositions: number; inPipeline: number;
    interviewsThisWeek: number; offersOut: number; hiresMTD: number;
    avgTimeToHire: number; offersSentMTD: number; offersAcceptedMTD: number; acceptanceRate: number;
  };
  funnel: { stage: string; label: string; count: number }[];
  openReqAging: { id: string; title: string; requisitionNumber: string; recruiter: string; candidates: number; ageDays: number; etaDays: number; status: "on-track" | "aging" | "overdue" }[];
  recruiterWorkload: { id: string; name: string; count: number }[];
  activity: { type: "offer-accepted" | "offer-sent" | "interview"; name: string; detail: string; at: string }[];
}

// Sequential green ramp — darker = deeper in the funnel.
const FUNNEL_COLORS = ["#4ade80", "#22c55e", "#16a34a", "#15803d", "#166534", "#14532d", "#052e16"];

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

export default function RecruitDashboardPage() {
  const api = useApiClient();
  const { hasPermission, isLoading: permsLoading } = useDashboardConfig();
  const canView = hasPermission("hrms.recruit.read") || hasPermission("hrms.recruit.write");

  const { data, isLoading } = useQuery({
    queryKey: ["recruit-dashboard"],
    queryFn: () => api.get<DashboardData>("/api/v1/hrms/recruit/dashboard"),
    enabled: canView,
    staleTime: 60_000,
  });
  const d = data?.data;

  if (!permsLoading && !canView) {
    return (
      <EmptyState
        variant="folder"
        title="You don't have access to the Recruitment Dashboard"
        description="Recruitment analytics are restricted. Contact your administrator if you need access."
      />
    );
  }

  const funnelMax = Math.max(1, ...(d?.funnel.map((f) => f.count) ?? [1]));

  const kpiTiles = d ? [
    { icon: <Briefcase size={16} />, n: d.kpis.openRequisitions, l: "Open Requisitions", sub: `${d.kpis.openPositions} positions` },
    { icon: <Users size={16} />, n: d.kpis.inPipeline, l: "In Pipeline" },
    { icon: <Calendar size={16} />, n: d.kpis.interviewsThisWeek, l: "Interviews / week" },
    { icon: <FileText size={16} />, n: d.kpis.offersOut, l: "Offers Out" },
    { icon: <Award size={16} />, n: d.kpis.hiresMTD, l: "Hires (this month)" },
    { icon: <Clock size={16} />, n: d.kpis.avgTimeToHire, l: "Avg Time-to-Hire", suffix: "d" },
  ] : [];

  return (
    <div className="w-full px-5 py-4 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-page-title text-gray-900">Recruitment Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">Hiring health across all open roles · this month</p>
        </div>
        <Link href="/recruit/pipeline" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-sm">
          <TrendingUp size={13} /> Open Pipeline
        </Link>
      </div>

      {isLoading || !d ? (
        <SkeletonCards count={6} />
      ) : (
        <>
          {/* KPI tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {kpiTiles.map((k) => (
              <div key={k.l} className="bg-white border border-gray-200 rounded-xl shadow-sm p-3.5">
                <span className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">{k.icon}</span>
                <div className="text-2xl font-bold text-gray-900 leading-none mt-2.5 tabular-nums">
                  {k.n}{k.suffix && <span className="text-base font-semibold">{k.suffix}</span>}
                </div>
                <div className="text-[11.5px] text-gray-500 font-semibold mt-1">{k.l}</div>
                {k.sub && <div className="text-[11px] text-gray-400 mt-0.5">{k.sub}</div>}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
            {/* Funnel */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="px-4 pt-4 pb-1 flex items-center gap-2">
                <h2 className="text-[13px] font-bold text-gray-900">Pipeline funnel</h2>
                <span className="ml-auto text-[11.5px] text-gray-400">{d.kpis.inPipeline} active</span>
              </div>
              <div className="p-4 space-y-2.5">
                {d.funnel.map((f, i) => {
                  const prev = i > 0 ? d.funnel[i - 1].count : null;
                  const conv = prev && prev > 0 ? Math.round((f.count / prev) * 100) : null;
                  return (
                    <div key={f.stage} className="grid grid-cols-[130px_1fr_54px] items-center gap-2.5">
                      <span className="text-[12.5px] text-gray-600 font-medium truncate">{f.label}</span>
                      <span className="h-6 rounded-md bg-gray-50 overflow-hidden">
                        <span className="block h-full rounded-md transition-all" style={{ width: `${Math.max(3, (f.count / funnelMax) * 100)}%`, background: FUNNEL_COLORS[Math.min(i, FUNNEL_COLORS.length - 1)] }} />
                      </span>
                      <span className="text-[13px] font-bold text-gray-900 text-right tabular-nums">
                        {f.count}{conv !== null && <span className="text-[10px] text-gray-400 font-semibold ml-1">{conv}%</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Offers & time-to-hire */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <h2 className="text-[13px] font-bold text-gray-900 px-4 pt-4">Offers &amp; time-to-hire</h2>
              <div className="p-4 grid grid-cols-2 gap-3">
                <Stat n={d.kpis.offersSentMTD} l="Offers sent" />
                <Stat n={d.kpis.offersAcceptedMTD} l="Accepted" />
                <div className="col-span-2 bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center gap-4">
                  <div className="relative grid place-items-center shrink-0">
                    <div className="w-16 h-16 rounded-full" style={{ background: `conic-gradient(#16a34a ${d.kpis.acceptanceRate}%, #e5efe9 0)` }} />
                    <div className="absolute w-11 h-11 rounded-full bg-white grid place-items-center text-[13px] font-extrabold text-gray-900 tabular-nums">{d.kpis.acceptanceRate}%</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-500 font-semibold">Offer acceptance rate</div>
                    <div className="text-xs text-gray-600 mt-1">{d.kpis.offersAcceptedMTD} of {d.kpis.offersSentMTD} offers this month</div>
                  </div>
                </div>
                <Stat n={`${d.kpis.avgTimeToHire}d`} l="Avg time-to-hire" />
                <Stat n={d.kpis.hiresMTD} l="Hires this month" />
              </div>
            </div>
          </div>

          {/* Open requisitions & aging */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 pt-4 pb-3 flex items-center gap-2">
              <h2 className="text-[13px] font-bold text-gray-900">Open requisitions &amp; aging</h2>
              <span className="ml-auto text-[11.5px] text-gray-400">{d.kpis.openRequisitions} open · {d.kpis.openPositions} positions</span>
            </div>
            {d.openReqAging.length === 0 ? (
              <div className="px-4 pb-6 text-sm text-gray-400 text-center">No open requisitions.</div>
            ) : (
              <table className="w-full text-[12.5px]">
                <thead>
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
                          <Link href="/recruit/requisitions" className="font-semibold text-gray-900 hover:text-green-700 hover:underline">{r.title}</Link>
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
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recruiter workload */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="px-4 pt-4 pb-1 flex items-center gap-2">
                <h2 className="text-[13px] font-bold text-gray-900">Recruiter workload</h2>
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
                      <span className="h-2 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full bg-green-500 rounded-full" style={{ width: `${(r.count / max) * 100}%` }} /></span>
                      <span className="text-[12px] font-bold text-gray-900 text-right tabular-nums">{r.count}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Recent activity */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <h2 className="text-[13px] font-bold text-gray-900 px-4 pt-4">Recent activity</h2>
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
