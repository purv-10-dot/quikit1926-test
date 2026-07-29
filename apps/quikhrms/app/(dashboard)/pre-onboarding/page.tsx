"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Plane, Search, ArrowRight, Upload, Download, Plus, Filter } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { clsx } from "clsx";
import { exportCsv as exportCsvFile, fmtDate, type CsvColumn } from "@/lib/utils/csv";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import { PageBackground } from "@/components/hrms/page-background";
import { AddCandidateWizard } from "../onboarding/_components/add-candidate-wizard";

interface Emp {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  jobTitle: string | null;
  dateOfJoining: string | null;
  department: { id: string; name: string } | null;
}

function fullName(e: Emp) { return e.displayName || `${e.firstName} ${e.lastName}`.trim(); }
function initials(e: Emp) { return `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase() || "?"; }

export default function PreOnboardingPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<{ department: string[]; designation: string[] }>({ department: [], designation: [] });
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilters(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["pre-onboarding", "roster", search],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      return api.get<Emp[]>(`/api/v1/hrms/pre-onboarding/roster?${qs.toString()}`);
    },
    staleTime: 60_000,
  });
  const rows = data?.data ?? [];

  const deptOptions = Array.from(new Set(rows.map((e) => e.department?.name).filter(Boolean) as string[])).sort();
  const desigOptions = Array.from(new Set(rows.map((e) => e.jobTitle).filter(Boolean) as string[])).sort();
  const filtered = rows.filter((e) => {
    if (filters.department.length && !filters.department.includes(e.department?.name ?? "")) return false;
    if (filters.designation.length && !filters.designation.includes(e.jobTitle ?? "")) return false;
    return true;
  });
  const activeFilterCount = filters.department.length + filters.designation.length;

  const COLUMNS: CsvColumn<Emp>[] = [
    { header: "Employee Code", value: (e) => e.employeeCode },
    { header: "First Name", value: (e) => e.firstName },
    { header: "Last Name", value: (e) => e.lastName },
    { header: "Designation", value: (e) => e.jobTitle },
    { header: "Department", value: (e) => e.department?.name ?? null },
    { header: "Joining Date", value: (e) => fmtDate(e.dateOfJoining) },
  ];
  const excelColumns = COLUMNS.map((c, i) => ({ header: c.header, key: `c${i}`, width: Math.min(30, Math.max(12, c.header.length + 4)) }));
  const excelRows = filtered.map((e) => {
    const row: Record<string, unknown> = {};
    COLUMNS.forEach((col, i) => { const v = col.value(e); row[`c${i}`] = v == null ? "" : v; });
    return row;
  });

  // Quick summary counts derived from the loaded roster (no extra API call).
  const nowDay = new Date(); nowDay.setHours(0, 0, 0, 0);
  const weekEnd = new Date(nowDay); weekEnd.setDate(nowDay.getDate() + 7);
  const monthEnd = new Date(nowDay.getFullYear(), nowDay.getMonth() + 1, 0);
  const inRange = (d: string | null, end: Date) => !!d && new Date(d) >= nowDay && new Date(d) <= end;
  const preStats: Array<[string, number]> = [
    ["In Pre-Onboarding", filtered.length],
    ["Joining This Week", filtered.filter((e) => inRange(e.dateOfJoining, weekEnd)).length],
    ["Joining This Month", filtered.filter((e) => inRange(e.dateOfJoining, monthEnd)).length],
    ["Joining Date TBD", filtered.filter((e) => !e.dateOfJoining).length],
  ];

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Plane size={26} className="text-[#166534] mt-1" />
          <div>
            <h1 className="text-page-title text-gray-900">Pre-Onboarding</h1>
            <p className="text-sm text-gray-500">Candidates who accepted the offer — getting them ready before Day 1 (BGV, documents, credentials, facilities).</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => exportCsvFile("pre-onboarding", COLUMNS, filtered)} disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-50 transition disabled:opacity-50">
            <Download size={14} /> CSV
          </button>
          <ExcelExportButton filename="pre-onboarding" sheetName="Pre-Onboarding" columns={excelColumns} rows={excelRows} label="Excel" />
          <Link href="/onboarding/candidates/bulk-import"
            className="inline-flex items-center gap-1.5 border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition">
            <Upload size={13} /> Bulk Upload
          </Link>
          <button onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition">
            <Plus size={13} /> Pre-Onboard Candidate
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {preStats.map(([label, val]) => (
          <div key={label} className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
            <div className="text-xs text-gray-500 uppercase">{label}</div>
            <div className="text-base md:text-base font-bold text-gray-900 mt-1">{val}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 flex items-center gap-2 flex-1 max-w-md">
          <Search size={14} className="text-gray-400" />
          <input placeholder="Search candidates…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm focus:outline-none" />
        </div>
        <div className="relative" ref={filterRef}>
          <button type="button" onClick={() => setShowFilters((v) => !v)}
            className={clsx("inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg border text-xs font-medium transition",
              activeFilterCount > 0 ? "border-green-300 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50")}>
            <Filter size={14} /> Filters
            {activeFilterCount > 0 && <span className="ml-0.5 px-1.5 rounded-full bg-green-600 text-white text-[10px] font-bold">{activeFilterCount}</span>}
          </button>
          {showFilters && (
            <div className="absolute left-0 top-full mt-1.5 z-20 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Department</div>
                {deptOptions.length === 0 ? <p className="text-[11px] text-gray-400">No departments</p> : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {deptOptions.map((d) => (
                      <label key={d} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input type="checkbox" className="accent-green-600" checked={filters.department.includes(d)}
                          onChange={() => setFilters((f) => ({ ...f, department: f.department.includes(d) ? f.department.filter((x) => x !== d) : [...f.department, d] }))} />
                        {d}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-gray-100 pt-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Designation</div>
                {desigOptions.length === 0 ? <p className="text-[11px] text-gray-400">No designations</p> : (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {desigOptions.map((d) => (
                      <label key={d} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input type="checkbox" className="accent-green-600" checked={filters.designation.includes(d)}
                          onChange={() => setFilters((f) => ({ ...f, designation: f.designation.includes(d) ? f.designation.filter((x) => x !== d) : [...f.designation, d] }))} />
                        {d}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {activeFilterCount > 0 && (
                <button type="button" onClick={() => setFilters({ department: [], designation: [] })}
                  className="w-full text-center text-[11px] font-medium text-red-600 hover:underline pt-1">
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
        {filters.department.map((d) => (
          <span key={`fd-${d}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-green-700 text-[11px] font-medium">
            {d}
            <button onClick={() => setFilters((f) => ({ ...f, department: f.department.filter((x) => x !== d) }))} className="hover:text-green-900">×</button>
          </span>
        ))}
        {filters.designation.map((d) => (
          <span key={`fg-${d}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-medium">
            {d}
            <button onClick={() => setFilters((f) => ({ ...f, designation: f.designation.filter((x) => x !== d) }))} className="hover:text-blue-900">×</button>
          </span>
        ))}
      </div>

      {isLoading ? <SkeletonTable rows={6} cols={3} /> : filtered.length === 0 ? (
        <div className="surface-card p-8 text-center text-gray-500">
          <Plane size={30} className="mx-auto mb-2 text-gray-300" />
          <p>{activeFilterCount > 0 ? "No candidates match filters." : "No one in pre-onboarding right now."}</p>
          <p className="text-xs mt-1">{activeFilterCount > 0 ? "Try clearing some filters." : "Candidates appear here once their offer is accepted and they're converted to a pre-hire."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((e) => (
            <Link key={e.id} href={`/onboarding/${e.id}`}
              className="surface-card p-4 flex items-center gap-3 hover:border-[#166534]/30 hover:shadow-md transition group">
              <span className="w-10 h-10 rounded-full bg-[#166534]/10 text-[#166534] grid place-items-center text-sm font-bold shrink-0">{initials(e)}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-gray-900 truncate group-hover:text-[#166534]">{fullName(e)}</div>
                <div className="text-[11px] text-gray-400 truncate">
                  {e.employeeCode}{e.jobTitle ? ` · ${e.jobTitle}` : ""}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {e.dateOfJoining ? `Joins ${new Date(e.dateOfJoining).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : "Joining date TBD"}
                  {e.department ? ` · ${e.department.name}` : ""}
                </div>
              </div>
              <ArrowRight size={15} className={clsx("text-gray-300 shrink-0 group-hover:text-[#166534]")} />
            </Link>
          ))}
        </div>
      )}

      <AddCandidateWizard
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => {
          setShowAdd(false);
          qc.invalidateQueries({ queryKey: ["pre-onboarding"] });
        }}
      />
    </div>
  );
}
