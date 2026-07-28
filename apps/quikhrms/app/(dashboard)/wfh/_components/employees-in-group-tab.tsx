"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { clsx } from "clsx";
import { useApiClient } from "@/lib/hooks/use-api";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

interface GroupMemberRow {
  id: string;
  employeeName: string;
  organizationName: string;
  department: string;
  designation: string;
  workEmail: string;
  experienceMonths: number;
  wfhGroupName: string;
}

const LIMIT = 10;

export function WfhEmployeesInGroupTab() {
  const api = useApiClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["wfh", "group-members", search, page],
    queryFn: () =>
      api.get<GroupMemberRow[]>(
        `/api/v1/hrms/wfh/group-members?search=${encodeURIComponent(search)}&page=${page}&limit=${LIMIT}`,
      ),
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;

  const WINDOW = 5;
  let winStart = Math.max(1, page - 2);
  const winEnd = Math.min(totalPages, winStart + WINDOW - 1);
  winStart = Math.max(1, winEnd - WINDOW + 1);
  const pageNumbers = Array.from({ length: winEnd - winStart + 1 }, (_, i) => winStart + i);

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">Employees In All WFH Groups</h2>
        <div className="relative w-72 max-w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search employee..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-[#166534]"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-accent-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600">
              <th className="px-4 py-3 w-14">S. No.</th>
              <th className="px-4 py-3">Employee Name</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Department</th>
              <th className="px-4 py-3">Designation</th>
              <th className="px-4 py-3">Official Email</th>
              <th className="px-4 py-3 whitespace-nowrap">Experience (Months)</th>
              <th className="px-4 py-3">WFH Group</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-gray-400">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-gray-400">No employees found.</td></tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500">{(page - 1) * LIMIT + i + 1}</td>
                  <td className="px-4 py-3 text-xs font-medium text-gray-900">{r.employeeName}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{r.organizationName || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{r.department || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{r.designation || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{r.workEmail || "—"}</td>
                  <td className="px-4 py-3 text-xs text-gray-600 tabular-nums">{r.experienceMonths}</td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {r.wfhGroupName ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded bg-green-50 text-green-700 text-[11px] font-medium">{r.wfhGroupName}</span>
                    ) : (
                      <span className="text-gray-400">No group</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
          <span>{total} employees</span>
          <div className="flex items-center gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
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
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50"
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
