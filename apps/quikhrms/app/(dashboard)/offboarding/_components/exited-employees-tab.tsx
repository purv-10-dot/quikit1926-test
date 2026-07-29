"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import { Search, ChevronLeft, ChevronRight, Eye } from "lucide-react";

interface ExitRow {
  id: string;
  name: string;
  employeeCode: string;
  workEmail: string;
  department: string;
  designation: string;
  employmentType: string;
  workLocation: string;
  reportingManager: string;
  dateOfJoining: string | null;
  lastWorkingDate: string | null;
  tenureMonths: number | null;
  reason: string;
  offboardingStatus: string;
  resignationDate: string | null;
  exitInterviewDone: boolean;
  exitInterviewAt: string | null;
  notes: string;
}

const LIMIT = 10;

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtTenure = (m?: number | null) => {
  if (m == null) return "—";
  const y = Math.floor(m / 12);
  const mo = m % 12;
  return [y ? `${y}y` : "", mo ? `${mo}m` : ""].filter(Boolean).join(" ") || "0m";
};

export function ExitedEmployeesTab() {
  const api = useApiClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<ExitRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["offboarding", "exits", search, page],
    queryFn: () =>
      api.get<ExitRow[]>(`/api/v1/hrms/offboarding/exits?search=${encodeURIComponent(search)}&page=${page}&limit=${LIMIT}`),
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;

  // Windowed page numbers (up to 5 around the current page).
  const WINDOW = 5;
  let winStart = Math.max(1, page - 2);
  const winEnd = Math.min(totalPages, winStart + WINDOW - 1);
  winStart = Math.max(1, winEnd - WINDOW + 1);
  const pageNumbers = Array.from({ length: winEnd - winStart + 1 }, (_, i) => winStart + i);

  const excelColumns = [
    { header: "Name", key: "name", width: 24 },
    { header: "Emp Code", key: "employeeCode", width: 16 },
    { header: "Email", key: "workEmail", width: 26 },
    { header: "Department", key: "department", width: 18 },
    { header: "Designation", key: "designation", width: 20 },
    { header: "Employment Type", key: "employmentType", width: 16 },
    { header: "Work Location", key: "workLocation", width: 16 },
    { header: "Reporting Manager", key: "reportingManager", width: 20 },
    { header: "Date of Joining", key: "doj", width: 16 },
    { header: "Last Working Day", key: "lwd", width: 16 },
    { header: "Tenure", key: "tenure", width: 12 },
    { header: "Exit Reason", key: "reason", width: 16 },
    { header: "Offboarding Status", key: "offboardingStatus", width: 18 },
    { header: "Exit Interview", key: "exitInterview", width: 14 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  const excelRows = rows.map((r) => ({
    name: r.name, employeeCode: r.employeeCode, workEmail: r.workEmail,
    department: r.department, designation: r.designation, employmentType: r.employmentType,
    workLocation: r.workLocation, reportingManager: r.reportingManager,
    doj: fmtDate(r.dateOfJoining), lwd: fmtDate(r.lastWorkingDate), tenure: fmtTenure(r.tenureMonths),
    reason: r.reason, offboardingStatus: r.offboardingStatus,
    exitInterview: r.exitInterviewDone ? "Done" : "Pending", notes: r.notes,
  }));

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Exited Employees</h2>
        <div className="flex items-center gap-2">
          <div className="relative w-64 max-w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search exited employees..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-[#166534]"
            />
          </div>
          <ExcelExportButton filename="exited-employees" sheetName="Exits" columns={excelColumns} rows={excelRows} label="Excel" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-[11px] font-semibold uppercase tracking-[0.04em] text-gray-500">
            <tr>
              <th className="text-left px-4 py-2.5 w-12">#</th>
              <th className="text-left px-4 py-2.5">Employee</th>
              <th className="text-left px-4 py-2.5">Department</th>
              <th className="text-left px-4 py-2.5">Designation</th>
              <th className="text-left px-4 py-2.5">Exit Reason</th>
              <th className="text-left px-4 py-2.5">Last Working Day</th>
              <th className="text-left px-4 py-2.5">Tenure</th>
              <th className="text-left px-4 py-2.5">Exit Interview</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-400">No exited employees.</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-500">{(page - 1) * LIMIT + i + 1}</td>
                  <td className="px-4 py-2.5">
                    <div className="text-[13px] font-medium text-gray-900">{r.name}</div>
                    <div className="text-gray-400">{r.employeeCode}</div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{r.department || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{r.designation || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{r.reason || "—"}</td>
                  <td className="px-4 py-2.5 text-gray-600">{fmtDate(r.lastWorkingDate)}</td>
                  <td className="px-4 py-2.5 text-gray-600 tabular-nums">{fmtTenure(r.tenureMonths)}</td>
                  <td className="px-4 py-2.5">
                    <span className={r.exitInterviewDone ? "text-green-600" : "text-amber-600"}>
                      {r.exitInterviewDone ? "Done" : "Pending"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setDetail(r)} className="inline-flex items-center gap-1 text-[#22c55e] hover:underline">
                      <Eye size={12} /> View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
          <span>{total} exited</span>
          <div className="flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
              <ChevronLeft size={13} /> Prev
            </button>
            {winStart > 1 && (
              <>
                <button onClick={() => setPage(1)} className="min-w-[28px] px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">1</button>
                {winStart > 2 && <span className="px-1 text-gray-400">…</span>}
              </>
            )}
            {pageNumbers.map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={clsx(
                  "min-w-[28px] px-2 py-1 rounded border transition",
                  n === page ? "bg-green-600 text-white border-green-600" : "border-gray-200 hover:bg-gray-50",
                )}
              >
                {n}
              </button>
            ))}
            {winEnd < totalPages && (
              <>
                {winEnd < totalPages - 1 && <span className="px-1 text-gray-400">…</span>}
                <button onClick={() => setPage(totalPages)} className="min-w-[28px] px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">{totalPages}</button>
              </>
            )}
            <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Read-only detail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.name} · Exit details` : ""} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <Detail label="Employee Code" value={detail.employeeCode} />
              <Detail label="Email" value={detail.workEmail} />
              <Detail label="Department" value={detail.department} />
              <Detail label="Designation" value={detail.designation} />
              <Detail label="Employment Type" value={detail.employmentType} />
              <Detail label="Work Location" value={detail.workLocation} />
              <Detail label="Reporting Manager" value={detail.reportingManager} />
              <Detail label="Date of Joining" value={fmtDate(detail.dateOfJoining)} />
              <Detail label="Last Working Day" value={fmtDate(detail.lastWorkingDate)} />
              <Detail label="Tenure" value={fmtTenure(detail.tenureMonths)} />
              <Detail label="Exit Reason" value={detail.reason} />
              <Detail label="Offboarding Status" value={detail.offboardingStatus} />
              <Detail label="Resignation / Notice Date" value={fmtDate(detail.resignationDate)} />
              <Detail label="Exit Interview" value={detail.exitInterviewDone ? `Done${detail.exitInterviewAt ? ` · ${fmtDate(detail.exitInterviewAt)}` : ""}` : "Pending"} />
            </div>
            {detail.notes && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400 mb-1">Notes</p>
                <p className="text-xs text-gray-700 whitespace-pre-wrap rounded-lg bg-gray-50 p-3">{detail.notes}</p>
              </div>
            )}
            <p className="text-[11px] text-gray-400">This is a read-only exit record.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm text-gray-800 mt-0.5">{value || "—"}</p>
    </div>
  );
}
