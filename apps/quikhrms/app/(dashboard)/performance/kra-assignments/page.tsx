"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Select } from "@/components/hrms/ui/select";
import { Users, Target, Search, ArrowRight, Briefcase, Building2 } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonTable } from "@/components/hrms/skeleton";

interface Scorecard { id: string; name: string }
interface Employee {
  id: string; employeeCode: string; firstName: string; lastName: string;
  profilePhoto: string | null;
  department: { name: string } | null;
  designation: { title: string } | null;
}
interface Assignment {
  id: string;
  employeeId: string;
  scorecardId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "Active" | "Completed" | "Cancelled";
  compositeScore: number | string | null;
  snapshot: {
    scorecardName: string;
    kras: { id: string; weight: number; kpis: { id: string; weight: number }[] }[];
  };
  progress: Record<string, { score?: number | null }>;
  scorecard: Scorecard | null;
  employee: Employee | null;
}

const STATUS_BADGE: Record<Assignment["status"], string> = {
  Active: "bg-green-100 text-green-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Cancelled: "bg-gray-100 text-gray-600",
};

export default function KraAssignmentsPage() {
  const api = useApiClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["performance", "kra-assignments", statusFilter],
    queryFn: () => api.get<Assignment[]>(
      `/api/v1/hrms/performance/kra-assignments${statusFilter ? `?status=${statusFilter}` : ""}`,
    ),
  });

  const assignments = (data?.data ?? []).filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.employee?.firstName.toLowerCase().includes(q)
      || a.employee?.lastName.toLowerCase().includes(q)
      || a.employee?.employeeCode.toLowerCase().includes(q)
      || a.snapshot.scorecardName.toLowerCase().includes(q)
    );
  });

  // Progress % = scored KPIs / total KPIs.
  // Completed assignments report 100% regardless of scoring — the work is
  // "done" semantically; missing per-KPI scores are a separate signal.
  const progressPercent = (a: Assignment): number => {
    if (a.status === "Completed") return 100;
    const totalKpis = a.snapshot.kras.reduce((s, k) => s + k.kpis.length, 0);
    if (totalKpis === 0) return 0;
    const scoredKpis = a.snapshot.kras.reduce((s, k) =>
      s + k.kpis.filter((p) => a.progress[p.id]?.score != null).length, 0);
    return Math.round((scoredKpis / totalKpis) * 100);
  };

  // Count of KPIs actually scored — independent of status, used to warn when
  // an assignment was marked Completed without any KPI scoring.
  const scoredKpiCount = (a: Assignment): { scored: number; total: number } => {
    const total = a.snapshot.kras.reduce((s, k) => s + k.kpis.length, 0);
    const scored = a.snapshot.kras.reduce((s, k) =>
      s + k.kpis.filter((p) => a.progress[p.id]?.score != null).length, 0);
    return { scored, total };
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users size={28} className="text-[#22c55e]" />
          <div>
            <h1 className="text-page-title text-gray-900">KRA Assignments</h1>
            <p className="text-xs text-gray-500">
              Scorecards assigned to employees. Each row carries a frozen copy of its template.
            </p>
          </div>
        </div>
        <Link
          href="/performance/kra-templates"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium"
        >
          <Target size={13} /> Templates
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-64">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by employee or scorecard…"
            className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#166534]/20 focus:border-[#166534]"
          />
        </div>
        <div className="w-44">
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "", label: "All status" },
              { value: "Active", label: "Active" },
              { value: "Completed", label: "Completed" },
              { value: "Cancelled", label: "Cancelled" },
            ]}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-2"><SkeletonTable rows={5} cols={6} /></div>
        ) : assignments.length === 0 ? (
          <div className="py-12 text-center">
            <Users size={28} className="text-gray-300 mx-auto mb-2" />
            <p className="text-[13px] font-semibold text-gray-900">No assignments yet</p>
            <p className="text-xs text-gray-500 mt-1">
              Go to <Link href="/performance/kra-templates" className="text-[#22c55e] hover:underline">KRA Templates</Link> and click <strong>Assign</strong> on a scorecard.
            </p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-table-head uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2.5">Employee</th>
                <th className="text-left px-4 py-2.5">Scorecard</th>
                <th className="text-left px-4 py-2.5">Period</th>
                <th className="text-left px-4 py-2.5">Progress</th>
                <th className="text-right px-4 py-2.5">Composite</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments.map((a) => {
                const pct = progressPercent(a);
                const { scored, total } = scoredKpiCount(a);
                const completedWithoutScores = a.status === "Completed" && scored === 0;
                const initials = a.employee
                  ? `${a.employee.firstName[0] ?? ""}${a.employee.lastName[0] ?? ""}`.toUpperCase()
                  : "?";
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/performance/kra-assignments/${a.id}`} className="flex items-center gap-2.5">
                        {a.employee?.profilePhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.employee.profilePhoto} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-green-600 text-white flex items-center justify-center text-xs font-bold">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-gray-900 truncate">
                            {a.employee ? `${a.employee.firstName} ${a.employee.lastName}` : "—"}
                          </p>
                          <p className="text-[11px] text-gray-500 flex items-center gap-2">
                            <span className="font-mono">{a.employee?.employeeCode}</span>
                            {a.employee?.designation?.title && (
                              <span className="inline-flex items-center gap-0.5"><Briefcase size={9} />{a.employee.designation.title}</span>
                            )}
                            {a.employee?.department?.name && (
                              <span className="inline-flex items-center gap-0.5"><Building2 size={9} />{a.employee.department.name}</span>
                            )}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{a.snapshot.scorecardName}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">
                      {new Date(a.effectiveFrom).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                      {a.effectiveTo && (
                        <> → {new Date(a.effectiveTo).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}</>
                      )}
                    </td>
                    <td className="px-4 py-2.5 w-44">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={clsx(
                              "h-full transition-all",
                              pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-green-500" : "bg-gray-300",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-gray-500 tabular-nums w-8 text-right">{pct}%</span>
                      </div>
                      <p className={clsx(
                        "text-[10px] mt-0.5",
                        completedWithoutScores ? "text-amber-700 font-semibold" : "text-gray-400",
                      )}>
                        {completedWithoutScores
                          ? `Completed without scoring (0 / ${total} KPIs)`
                          : `${scored} / ${total} KPIs scored`}
                      </p>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {a.compositeScore != null ? (
                        <span className="font-bold text-gray-900 tabular-nums">{Number(a.compositeScore).toFixed(2)}</span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                      <span className="text-[10px] text-gray-400"> / 5</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", STATUS_BADGE[a.status])}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <Link
                        href={`/performance/kra-assignments/${a.id}`}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-400 hover:text-[#22c55e] hover:bg-green-50"
                      >
                        <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
