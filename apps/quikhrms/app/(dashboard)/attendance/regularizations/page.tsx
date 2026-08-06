"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Check, X, Clock, FileText, Loader2 } from "lucide-react";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import { PageBackground } from "@/components/hrms/page-background";
import { Pagination } from "@/components/hrms/pagination";
import { TabSwitcher } from "@/components/hrms/tab-switcher";

const REG_EXPORT_COLUMNS = [
  { header: "Date", key: "date", width: 16 },
  { header: "Employee", key: "employee", width: 26 },
  { header: "Attendance", key: "attendance", width: 22 },
  { header: "Regularization Status", key: "status", width: 20 },
  { header: "Reason", key: "reason", width: 32 },
];

interface RegRecord {
  id: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  // The employee's REQUESTED corrected times — set while regularizationStatus
  // is "Pending". On Approve they get copied onto checkIn/checkOut (and these
  // are cleared); on Reject/Cancel both stay/become null. So checkIn/checkOut
  // alone are empty for the exact rows an approver needs to review.
  regularizedCheckIn: string | null;
  regularizedCheckOut: string | null;
  regularizationStatus: "None" | "Pending" | "Approved" | "Rejected" | "Cancelled";
  regularizationReason: string | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    profilePhoto: string | null;
    jobTitle: string | null;
  };
}

type Tab = "Pending" | "Approved" | "Rejected" | "Cancelled";

export default function RegularizationApprovalsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("Pending");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const { data, isLoading } = useQuery({
    queryKey: ["regularizations", tab],
    queryFn: () => api.get<RegRecord[]>(`/api/v1/hrms/attendance/regularizations?status=${tab}&limit=100`),
  });

  const records = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const pageItems = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportRows = useMemo(
    () =>
      records.map((r) => {
        const inVal = r.checkIn ?? r.regularizedCheckIn;
        const outVal = r.checkOut ?? r.regularizedCheckOut;
        const ci = inVal ? new Date(inVal).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
        const co = outVal ? new Date(outVal).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";
        return {
          date: new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
          employee: `${r.employee.firstName} ${r.employee.lastName}`.trim() + (r.employee.employeeCode ? ` (${r.employee.employeeCode})` : ""),
          attendance: `${ci} – ${co}`,
          status: r.regularizationStatus,
          reason: r.regularizationReason ?? "",
        };
      }),
    [records],
  );

  const actionMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "Approved" | "Rejected" }) =>
      api.patch(`/api/v1/hrms/attendance/records/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["regularizations"] });
      qc.invalidateQueries({ queryKey: ["attendance-week"] });
    },
  });

  return (
    <div>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <h1 className="text-base font-semibold text-gray-900 mb-1">Approve Regularizations</h1>
      <p className="text-xs text-gray-500 mb-5">Review attendance regularization requests from your team.</p>

      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <TabSwitcher
          value={tab}
          onChange={(v) => { setTab(v as Tab); setPage(1); }}
          tabs={(["Pending", "Approved", "Rejected", "Cancelled"] as Tab[]).map((t) => ({ value: t, label: t }))}
        />
        <div className="ml-auto">
          <ExcelExportButton filename="regularizations" sheetName="Regularizations" columns={REG_EXPORT_COLUMNS} rows={exportRows} label="Excel" />
        </div>
      </div>

      <div className="surface-card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-gray-400 text-xs flex flex-col items-center gap-2">
            <Clock size={28} className="text-gray-300" /> No {tab.toLowerCase()} regularizations
          </div>
        ) : (
          <>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-[11px] uppercase tracking-[0.04em] text-gray-500 font-semibold">
                <th className="px-4 py-2.5">Employee</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Clock-In</th>
                <th className="px-4 py-2.5">Clock-Out</th>
                <th className="px-4 py-2.5">Reason</th>
                {tab === "Pending" && <th className="px-4 py-2.5 text-right">Action</th>}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((r, i) => {
                const initials = `${r.employee.firstName[0] ?? ""}${r.employee.lastName[0] ?? ""}`.toUpperCase();
                // Pending rows carry the requested time in regularizedCheckIn/Out
                // (checkIn/Out are still empty); Approved rows have it copied onto
                // checkIn/Out already — this fallback covers both.
                const inVal = r.checkIn ?? r.regularizedCheckIn;
                const outVal = r.checkOut ?? r.regularizedCheckOut;
                return (
                  <tr key={r.id} className="row-stagger border-b border-gray-100 last:border-0 hover:bg-slate-50/60 transition-colors" style={{ ["--i" as never]: Math.min(i, 10) }}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        {r.employee.profilePhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.employee.profilePhoto} alt="" className="w-9 h-9 rounded-full object-cover ring-1 ring-gray-200" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#22c55e] to-[#16a34a] text-white flex items-center justify-center text-xs font-bold">
                            {initials}
                          </div>
                        )}
                        <div className="leading-tight">
                          <div className="text-[13px] font-medium text-gray-900">{r.employee.firstName} {r.employee.lastName}</div>
                          <div className="text-xs text-gray-500">{r.employee.employeeCode}{r.employee.jobTitle ? ` · ${r.employee.jobTitle}` : ""}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-gray-800">
                      {inVal ? new Date(inVal).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums text-gray-800">
                      {outVal ? new Date(outVal).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-4 py-2.5 max-w-sm">
                      <div className="flex items-start gap-2 text-gray-700 text-xs">
                        <FileText size={13} className="text-gray-400 mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{r.regularizationReason ?? "—"}</span>
                      </div>
                    </td>
                    {tab === "Pending" && (
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => actionMut.mutate({ id: r.id, status: "Approved" })}
                            disabled={actionMut.isPending}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-normal disabled:opacity-60"
                          >
                            <Check size={12} /> Approve
                          </button>
                          <button
                            onClick={() => actionMut.mutate({ id: r.id, status: "Rejected" })}
                            disabled={actionMut.isPending}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-normal disabled:opacity-60"
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} total={records.length} limit={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
