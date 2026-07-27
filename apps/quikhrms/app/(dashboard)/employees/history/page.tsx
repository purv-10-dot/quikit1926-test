"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { History, ArrowRight, Award, User as UserIcon } from "lucide-react";
import { EmptyState } from "@/components/hrms/empty-state";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { PageBackground } from "@/components/hrms/page-background";
import { clsx } from "clsx";

interface HistoryEntry {
  id: string; employeeId: string; changeType: string;
  fromValue: Record<string, unknown> | null; toValue: Record<string, unknown>;
  effectiveDate: string; reason: string | null; letterUrl: string | null; notes: string | null;
  approvedBy: string | null; createdAt: string;
  // Present only in the tenant-wide "all employees" feed.
  employee?: { id: string; firstName: string; lastName: string; employeeCode: string | null } | null;
}

const RATING_KEY = "Talent Rating";
const ratingColor = (r: string) =>
  r === "A-Player" ? "bg-emerald-100 text-emerald-700"
    : r === "B-Player" ? "bg-amber-100 text-amber-700"
      : r === "C-Player" ? "bg-red-100 text-red-700"
        : "bg-gray-100 text-gray-600";

const typeColors: Record<string, string> = {
  Promotion: "bg-green-100 text-green-700",
  Transfer: "bg-[#dcfce7] text-[#16a34a]",
  RoleChange: "bg-purple-100 text-purple-700",
  SalaryChange: "bg-emerald-100 text-emerald-700",
  ConfirmationChange: "bg-cyan-100 text-cyan-700",
  EmpStatusChange: "bg-yellow-100 text-yellow-700",
  DepartmentChange: "bg-[#dcfce7] text-[#16a34a]",
  ManagerChange: "bg-orange-100 text-orange-700",
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function EmploymentHistoryPage() {
  const api = useApiClient();
  const [employeeId, setEmployeeId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Per-employee history (when one is selected).
  const { data } = useQuery({
    queryKey: ["employee-history", employeeId],
    queryFn: () => api.get<HistoryEntry[]>(`/api/v1/hrms/employees/${employeeId}/history`),
    enabled: !!employeeId,
    // Always fetch fresh on view so a just-recorded change (e.g. a department
    // edit) shows immediately instead of from a stale 60s cache.
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Default view: all employees' history (no one selected).
  const { data: allData } = useQuery({
    queryKey: ["employee-history", "all"],
    queryFn: () => api.get<HistoryEntry[]>("/api/v1/hrms/employees/history?limit=500"),
    enabled: !employeeId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const allEntries = (employeeId ? data?.data : allData?.data) ?? [];
  const fromTs = fromDate ? new Date(fromDate).getTime() : null;
  const toTs = toDate ? new Date(toDate).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
  const entries = allEntries.filter((e) => {
    const t = new Date(e.effectiveDate).getTime();
    if (fromTs !== null && t < fromTs) return false;
    if (toTs !== null && t > toTs) return false;
    return true;
  });

  return (
    <div>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <History className="text-[#22c55e]" />
          <h1 className="text-base font-semibold text-gray-900">Employee Log</h1>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-2">
          <EmployeeSelect label="Employee" value={employeeId} onChange={setEmployeeId} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Effective From</label>
          <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Effective To</label>
          <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
        </div>
        {(fromDate || toDate) && (
          <div className="md:col-span-4 flex items-center justify-between text-xs text-gray-500">
            <span>Showing {entries.length} of {allEntries.length}</span>
            <button type="button" onClick={() => { setFromDate(""); setToDate(""); }} className="text-[#22c55e] hover:underline">Clear date filter</button>
          </div>
        )}
      </div>

      {(
        entries.length === 0 ? (
          <div className="p-1"><EmptyState variant="bot" title={fromDate || toDate ? "No changes in selected date range" : "No Data Found"} className="border border-gray-200 shadow-sm" /></div>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => {
              const keys = Object.keys(e.toValue ?? {});
              return (
                <div key={e.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      {/* Show who, in the all-employees feed (no employee selected). */}
                      {!employeeId && e.employee && (
                        <div className="flex items-center gap-1.5 mb-1.5 text-[13px] font-semibold text-gray-900">
                          <UserIcon size={13} className="text-gray-400" />
                          {e.employee.firstName} {e.employee.lastName}
                          {e.employee.employeeCode && (
                            <span className="text-xs font-normal text-gray-400">· {e.employee.employeeCode}</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium", typeColors[e.changeType] ?? "bg-gray-100 text-gray-700")}>{e.changeType}</span>
                        <span className="text-xs text-gray-500">Effective {fmtDate(e.effectiveDate)}</span>
                      </div>
                      {e.reason && <div className="text-xs text-gray-700 mt-2">{e.reason}</div>}

                      <div className="mt-2 space-y-1">
                        {keys.map((k) => {
                          const to = String(e.toValue[k]);
                          const from = e.fromValue?.[k];
                          if (k === RATING_KEY) {
                            return (
                              <div key={k} className="flex items-center gap-2 text-xs">
                                <Award size={13} className="text-gray-400" />
                                <span className="text-gray-500 w-32 shrink-0">Talent Rating</span>
                                <span className={clsx("px-2 py-0.5 rounded-full font-semibold", ratingColor(to))}>{to}</span>
                              </div>
                            );
                          }
                          return (
                            <div key={k} className="flex items-center gap-2 text-xs">
                              <span className="text-gray-500 w-32 shrink-0 truncate">{k}</span>
                              {from != null && from !== "" && (
                                <>
                                  <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">{String(from)}</span>
                                  <ArrowRight size={12} className="text-gray-400 shrink-0" />
                                </>
                              )}
                              <span className="bg-[#dcfce7] px-2 py-0.5 rounded text-[#16a34a] font-medium">{to}</span>
                            </div>
                          );
                        })}
                      </div>

                      {e.notes && <div className="text-xs text-gray-600 mt-2">{e.notes}</div>}
                    </div>
                    {e.letterUrl && (
                      <a href={e.letterUrl} target="_blank" rel="noreferrer" className="text-xs text-[#22c55e] hover:underline shrink-0 ml-3">View letter</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}
