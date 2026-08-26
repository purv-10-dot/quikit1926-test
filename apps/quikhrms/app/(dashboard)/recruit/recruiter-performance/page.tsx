"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { EmptyState } from "@/components/hrms/empty-state";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { Select } from "@/components/hrms/select";
import { Modal } from "@/components/hrms/modal";
import { LineChartView, DonutView, BarChartView } from "@/components/hrms/charts";
import { clsx } from "clsx";
import { Briefcase, Users, Calendar, Send, Award, Clock, Target, ShieldCheck, TrendingUp, CheckSquare, Hourglass, AlertCircle, PenLine } from "lucide-react";

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
  medianTimeToFillDays: number | null;
  avgTimeToHireDays: number | null;
  medianTimeToHireDays: number | null;
  slaOnTrack: number;
  slaAging: number;
  slaOverdue: number;
  slaCompliancePct: number | null;
  positionsClosed: number;
  avgTimeToClosePositionDays: number | null;
  escalations: number;
  dateRevisions: number;
  positions: { id: string; positionCode: string; status: string; requisitionTitle: string; requisitionNumber: string }[];
  activeRequisitionsList: { id: string; title: string; requisitionNumber: string; status: string; filledPositions: number; positions: number }[];
  activeCandidatesList: { id: string; candidateId: string; name: string; requisitionTitle: string; currentStage: string | null; appliedDate: string }[];
  hiresThisMonthList: { id: string; candidateId: string; name: string; requisitionTitle: string; hiredAt: string | null }[];
}
interface PerfData {
  recruiters: RecruiterRow[];
  orgAverage: { avgTimeToFillDays: number | null; medianTimeToFillDays: number | null; avgTimeToHireDays: number | null; medianTimeToHireDays: number | null } | null;
  funnel: { stage: string; count: number }[];
  stageTat: { stage: string; avgDays: number; count: number }[];
  monthlyTrends: { month: string; hires: number; closedRequisitions: number; avgTimeToFillDays: number | null }[];
  scope: "all" | "self";
}

function prettyStage(s: string): string {
  if (s === "Screening") return "Source";
  if (s === "HRInterview") return "HR Interview";
  if (s === "Offer") return "Offered";
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
  // Clicking a stat card opens its detail list on THIS page — never a
  // redirect, and always built only from whatever recruiter(s) are currently
  // in scope (self, or the filtered/all set) — never someone else's data.
  const [detailModal, setDetailModal] = useState<null | "requisitions" | "candidates" | "hires" | "positions">(null);

  const { data, isLoading, dataUpdatedAt } = useQuery({
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

  // Detail-modal lists — union of whatever recruiter(s) are currently in
  // scope (self, filtered-to-one, or all). Never fetched fresh/unscoped —
  // built straight from the already-permission-scoped rows above.
  const detailLists = {
    requisitions: (d?.recruiters ?? []).flatMap((r) => r.activeRequisitionsList),
    candidates: (d?.recruiters ?? []).flatMap((r) => r.activeCandidatesList),
    hires: (d?.recruiters ?? []).flatMap((r) => r.hiresThisMonthList),
    positions: (d?.recruiters ?? []).flatMap((r) => r.positions),
  };
  const detailModalTitle = { requisitions: "Active Requisitions", candidates: "Active Candidates", hires: "Hires (This Month)", positions: "My Assigned Positions" };

  // Derived, truthful sub-captions for the stat tiles below — computed from
  // data already fetched above, never fabricated.
  const openPositionsCount = detailLists.positions.filter((p) => p.status !== "Filled" && p.status !== "Cancelled").length;
  const inOfferCount = detailLists.candidates.filter((c) => c.currentStage === "Offer").length;

  const funnelData = (d?.funnel ?? []).map((f) => ({ name: prettyStage(f.stage), value: f.count }));
  const funnelTotal = funnelData.reduce((s, f) => s + f.value, 0);

  return (
    <div className="w-full px-5 py-4 space-y-4">
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-gray-400 mb-0.5">Talent Acquisition</p>
          <h1 className="text-page-title text-gray-900">{canSeeAll ? "Team Performance" : "My Performance"}</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {d?.scope === "self" ? "Your workload and hiring performance." : "Workload, SLA and hiring performance across recruiters."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {d && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-50 text-gray-500 ring-1 ring-gray-200 whitespace-nowrap">
              Updated {dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
            </span>
          )}
          {canSeeAll && d && d.recruiters.length > 0 && (
            <div className="w-56">
              <Select value={recruiterFilter} onChange={setRecruiterFilter}
                placeholder="All recruiters"
                options={[{ value: "", label: "All recruiters" }, ...d.recruiters.map((r) => ({ value: r.employeeId, label: r.name }))]} />
            </div>
          )}
        </div>
      </div>

      {isLoading ? <SkeletonCards count={4} /> : !d || d.recruiters.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          No recruiter activity yet — assign a recruiter to a requisition to see performance here.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-[13px] font-bold text-gray-800">{d.scope === "self" ? "Your workload" : "All company"}</h2>
            <p className="text-[11px] text-gray-400">Click any tile to see what sits behind the number.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(() => {
              const tiles = [
                { icon: <Users size={16} />, n: d.recruiters.length, l: "Total Recruiters", sub: d.scope === "self" ? "You" : undefined, bg: "bg-violet-50", fg: "text-violet-600", modal: null },
                { icon: <Briefcase size={16} />, n: totals!.activeReqs, l: "Open Requisitions", sub: undefined, bg: "bg-green-50", fg: "text-green-600", modal: "requisitions" as const },
                { icon: <Target size={16} />, n: totals!.activeCandidates, l: "Active Candidates", sub: inOfferCount > 0 ? `${inOfferCount} in Offer stage` : undefined, bg: "bg-purple-50", fg: "text-purple-600", modal: "candidates" as const },
                { icon: <Award size={16} />, n: totals!.hiresThisMonth, l: "Hires (This Month)", sub: undefined, bg: "bg-orange-50", fg: "text-orange-600", modal: "hires" as const },
                { icon: <CheckSquare size={16} />, n: detailLists.positions.length, l: "My Assigned Positions", sub: `${openPositionsCount} open`, bg: "bg-teal-50", fg: "text-teal-600", modal: "positions" as const },
              ];
              const maxN = Math.max(1, ...tiles.map((t) => t.n));
              return tiles.map((k, i) => {
                const active = !!k.modal && detailModal === k.modal;
                return (
                  <div key={i} onClick={k.modal ? () => setDetailModal(k.modal) : undefined}
                    className={clsx("rounded-lg shadow-sm border p-3.5 transition",
                      active ? "bg-accent-50 border-accent-200" : "bg-white border-gray-200",
                      k.modal && "cursor-pointer hover:shadow-md hover:border-gray-300")}>
                    <div className="flex items-center gap-3">
                      <div className={clsx("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", active ? "bg-accent-100 text-accent-700" : clsx(k.bg, k.fg))}>{k.icon}</div>
                      <div className="min-w-0">
                        <div className={clsx("text-lg font-bold leading-none", active ? "text-accent-800" : "text-gray-900")}>{k.n}</div>
                        <div className={clsx("text-[10.5px] font-bold uppercase tracking-wide mt-1", active ? "text-accent-600" : "text-gray-400")}>{k.l}</div>
                      </div>
                    </div>
                    <div className={clsx("mt-2.5 h-1 rounded-full overflow-hidden", active ? "bg-accent-100" : "bg-gray-100")}>
                      <div className={clsx("h-full rounded-full", active ? "bg-accent-500" : "bg-gray-300")}
                        style={{ width: `${Math.max(6, Math.round((k.n / maxN) * 100))}%` }} />
                    </div>
                    {k.sub && <div className={clsx("text-[10.5px] font-medium mt-1.5", active ? "text-accent-600" : "text-gray-400")}>{k.sub}</div>}
                  </div>
                );
              });
            })()}
          </div>

          {miniMetrics && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3.5 grid grid-cols-2 md:grid-cols-6 gap-4">
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
          )}

          {d.scope === "all" && (
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
                  <th className="text-right px-3 py-2">Positions Closed</th>
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
                    <td className="px-3 py-2 text-right">
                      {r.avgTimeToFillDays != null ? `${r.avgTimeToFillDays}d` : "—"}
                      {r.medianTimeToFillDays != null && <div className="text-[10px] text-gray-400">med {r.medianTimeToFillDays}d</div>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.avgTimeToHireDays != null ? `${r.avgTimeToHireDays}d` : "—"}
                      {r.medianTimeToHireDays != null && <div className="text-[10px] text-gray-400">med {r.medianTimeToHireDays}d</div>}
                    </td>
                    <td className="px-3 py-2 text-right">{slaBadge(r)}</td>
                    <td className="px-3 py-2 text-right">{r.positionsClosed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {funnelData.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="text-[13px] font-semibold text-gray-900 mb-3 flex items-center gap-1.5"><ShieldCheck size={14} className="text-green-600" /> Candidate Funnel</h2>
                <DonutView data={funnelData} height={220} />
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 text-xs">
                  <span className="font-semibold text-gray-700">Total Candidates</span>
                  <span className="font-bold text-gray-900">{funnelTotal}</span>
                </div>
              </div>
            )}

            {d.stageTat.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="text-[13px] font-semibold text-gray-900 mb-1 flex items-center gap-1.5"><Clock size={14} className="text-green-600" /> Turn-Around-Time per Stage</h2>
                <p className="text-[11px] text-gray-400 mb-3">Average days candidates spend in each stage before moving on.</p>
                <BarChartView data={d.stageTat.map((t) => ({ name: prettyStage(t.stage), value: t.avgDays }))} height={220} color="#16a34a" showValues />
              </div>
            )}
          </div>

          {d.monthlyTrends.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="text-[13px] font-semibold text-gray-900 mb-1 flex items-center gap-1.5"><TrendingUp size={14} className="text-green-600" /> Hires per Month</h2>
                <p className="text-[11px] text-gray-400 mb-2">Last 6 months.</p>
                <LineChartView data={d.monthlyTrends.map((t) => ({ name: t.month, value: t.hires }))} height={200} color="#16a34a" />
              </div>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <h2 className="text-[13px] font-semibold text-gray-900 mb-1 flex items-center gap-1.5"><Clock size={14} className="text-green-600" /> Avg Time-to-Fill per Month</h2>
                <p className="text-[11px] text-gray-400 mb-2">Business days, requisitions closed that month.</p>
                <LineChartView data={d.monthlyTrends.map((t) => ({ name: t.month, value: t.avgTimeToFillDays ?? 0 }))} height={200} color="#ef4444" yLabel="days" />
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <Send size={12} /> Candidate-level activity is attributed to each requisition's primary recruiter — precise per-candidate attribution for split requisitions lands in a later phase.
          </div>
        </>
      )}

      <Modal open={!!detailModal} onClose={() => setDetailModal(null)} size="md"
        title={detailModal ? detailModalTitle[detailModal] : ""}>
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
        {detailModal === "positions" && (
          detailLists.positions.length === 0 ? <p className="text-xs text-gray-400">Nothing here.</p> : (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {detailLists.positions.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-2.5 py-2 text-xs">
                  <span className="font-mono text-[11px] text-gray-700">{p.positionCode}</span>
                  <span className={clsx("inline-flex items-center h-5 px-2 rounded-full text-[10.5px] font-medium",
                    p.status === "Filled" ? "bg-green-50 text-green-700" : p.status === "Cancelled" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-600")}>
                    {p.status}
                  </span>
                  <span className="flex-1 text-gray-500 truncate">{p.requisitionTitle}</span>
                </div>
              ))}
            </div>
          )
        )}
      </Modal>
    </div>
  );
}
