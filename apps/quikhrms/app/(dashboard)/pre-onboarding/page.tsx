"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import {
  Users, Search, Upload, Download, Plus, Filter, ChevronRight, ChevronLeft, ChevronDown,
  Calendar, CalendarCheck, Building2, Clock, MapPin, RotateCcw,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { clsx } from "clsx";
import { exportCsv as exportCsvFile, fmtDate, type CsvColumn } from "@/lib/utils/csv";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import { PageBackground } from "@/components/hrms/page-background";
import { AddCandidateWizard } from "../onboarding/_components/add-candidate-wizard";

type BgvStatus = "Pending" | "In Progress" | "Completed" | null;

interface Emp {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  jobTitle: string | null;
  dateOfJoining: string | null;
  employmentType: string;
  workLocation: string;
  sourceOfHire: string | null;
  department: { id: string; name: string } | null;
  taskDone: number;
  taskTotal: number;
  progressPct: number;
  bgvStatus: BgvStatus;
}

function fullName(e: Emp) { return e.displayName || `${e.firstName} ${e.lastName}`.trim(); }
function initials(e: Emp) { return `${e.firstName?.[0] ?? ""}${e.lastName?.[0] ?? ""}`.toUpperCase() || "?"; }
function spaceCase(s: string) { return s.replace(/([a-z])([A-Z])/g, "$1 $2"); }
function joinDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : null;
}

// Per-card accent theme, cycled by index for the multi-colour card look.
const THEMES = [
  { dot: "bg-green-500",  avatar: "bg-green-100 text-green-700",   ring: "#22c55e", track: "#dcfce7", pill: "bg-green-50 text-green-700",   val: "text-green-600",  badge: "bg-green-50 text-green-700 ring-green-200" },
  { dot: "bg-blue-500",   avatar: "bg-blue-100 text-blue-700",     ring: "#3b82f6", track: "#dbeafe", pill: "bg-blue-50 text-blue-700",     val: "text-blue-600",   badge: "bg-blue-50 text-blue-700 ring-blue-200" },
  { dot: "bg-purple-500", avatar: "bg-purple-100 text-purple-700", ring: "#a855f7", track: "#f3e8ff", pill: "bg-purple-50 text-purple-700", val: "text-purple-600", badge: "bg-purple-50 text-purple-700 ring-purple-200" },
  { dot: "bg-orange-500", avatar: "bg-orange-100 text-orange-700", ring: "#f97316", track: "#ffedd5", pill: "bg-orange-50 text-orange-700", val: "text-orange-600", badge: "bg-orange-50 text-orange-700 ring-orange-200" },
  { dot: "bg-teal-500",   avatar: "bg-teal-100 text-teal-700",     ring: "#14b8a6", track: "#ccfbf1", pill: "bg-teal-50 text-teal-700",     val: "text-teal-600",   badge: "bg-teal-50 text-teal-700 ring-teal-200" },
  { dot: "bg-rose-500",   avatar: "bg-rose-100 text-rose-700",     ring: "#f43f5e", track: "#ffe4e6", pill: "bg-rose-50 text-rose-700",     val: "text-rose-600",   badge: "bg-rose-50 text-rose-700 ring-rose-200" },
];

function ProgressRing({ pct, color, track }: { pct: number; color: string; track: string }) {
  const size = 38, stroke = 4, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[10px] font-bold text-gray-700">{pct}%</span>
    </div>
  );
}

const STAT_META = [
  { label: "In Pre-Onboarding", sub: "Total candidates", icon: Users,         tile: "bg-green-100 text-green-600" },
  { label: "Joining This Week", sub: "Candidates",       icon: Calendar,      tile: "bg-blue-100 text-blue-600" },
  { label: "Joining This Month", sub: "Candidates",      icon: Calendar,      tile: "bg-purple-100 text-purple-600" },
  { label: "Joining Date TBD", sub: "Candidates",        icon: CalendarCheck, tile: "bg-orange-100 text-orange-600" },
] as const;

const PAGE_SIZES = [12, 24, 48];

export default function PreOnboardingPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [deptSel, setDeptSel] = useState<string[]>([]);
  const [joiningSel, setJoiningSel] = useState<"" | "week" | "month" | "tbd">("");
  const [statusSel, setStatusSel] = useState<"" | "Pending" | "In Progress" | "Completed">("");
  const [sourceSel, setSourceSel] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpenKey(null);
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
  const sourceOptions = Array.from(new Set(rows.map((e) => e.sourceOfHire).filter(Boolean) as string[])).sort();

  // Joining-date buckets shared by the stat cards and the Joining Date filter.
  const nowDay = new Date(); nowDay.setHours(0, 0, 0, 0);
  const weekEnd = new Date(nowDay); weekEnd.setDate(nowDay.getDate() + 7);
  const monthEnd = new Date(nowDay.getFullYear(), nowDay.getMonth() + 1, 0);
  const inRange = (d: string | null, end: Date) => !!d && new Date(d) >= nowDay && new Date(d) <= end;

  const filtered = rows.filter((e) => {
    if (deptSel.length && !deptSel.includes(e.department?.name ?? "")) return false;
    if (joiningSel === "tbd" && e.dateOfJoining) return false;
    if (joiningSel === "week" && !inRange(e.dateOfJoining, weekEnd)) return false;
    if (joiningSel === "month" && !inRange(e.dateOfJoining, monthEnd)) return false;
    if (statusSel && (e.bgvStatus ?? "") !== statusSel) return false;
    if (sourceSel && e.sourceOfHire !== sourceSel) return false;
    return true;
  });

  const activeFilterCount = (deptSel.length ? 1 : 0) + (joiningSel ? 1 : 0) + (statusSel ? 1 : 0) + (sourceSel ? 1 : 0);
  const clearAll = () => { setDeptSel([]); setJoiningSel(""); setStatusSel(""); setSourceSel(""); };

  // Reset to page 1 whenever the result set changes.
  useEffect(() => { setPage(1); }, [search, deptSel.join(","), joiningSel, statusSel, sourceSel, pageSize]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = total ? (safePage - 1) * pageSize + 1 : 0;
  const to = Math.min(safePage * pageSize, total);

  const stats = [
    filtered.length,
    filtered.filter((e) => inRange(e.dateOfJoining, weekEnd)).length,
    filtered.filter((e) => inRange(e.dateOfJoining, monthEnd)).length,
    filtered.filter((e) => !e.dateOfJoining).length,
  ];

  const COLUMNS: CsvColumn<Emp>[] = [
    { header: "Employee Code", value: (e) => e.employeeCode },
    { header: "First Name", value: (e) => e.firstName },
    { header: "Last Name", value: (e) => e.lastName },
    { header: "Designation", value: (e) => e.jobTitle },
    { header: "Department", value: (e) => e.department?.name ?? null },
    { header: "Employment Type", value: (e) => spaceCase(e.employmentType) },
    { header: "Work Location", value: (e) => e.workLocation },
    { header: "Joining Date", value: (e) => fmtDate(e.dateOfJoining) },
    { header: "BGV Status", value: (e) => e.bgvStatus ?? "—" },
  ];
  const excelColumns = COLUMNS.map((c, i) => ({ header: c.header, key: `c${i}`, width: Math.min(30, Math.max(12, c.header.length + 4)) }));
  const excelRows = filtered.map((e) => {
    const row: Record<string, unknown> = {};
    COLUMNS.forEach((col, i) => { const v = col.value(e); row[`c${i}`] = v == null ? "" : v; });
    return row;
  });

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />

      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-2">
          <span className="w-8 h-8 rounded-lg bg-green-100 text-green-600 grid place-items-center shrink-0">
            <Users size={16} />
          </span>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">Pre-Onboarding</h1>
            <p className="text-[11px] text-gray-500 mt-0.5 max-w-xl">
              Candidates who accepted the offer — getting them ready before Day 1 (BGV, documents, credentials, facilities).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => exportCsvFile("pre-onboarding", COLUMNS, filtered)} disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-medium shadow-sm hover:bg-gray-50 transition disabled:opacity-50">
            <Download size={13} /> CSV
          </button>
          <ExcelExportButton filename="pre-onboarding" sheetName="Pre-Onboarding" columns={excelColumns} rows={excelRows} label="Excel"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-medium shadow-sm hover:bg-gray-50 transition disabled:opacity-50" />
          <Link href="/onboarding/candidates/bulk-import"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-medium shadow-sm hover:bg-gray-50 transition">
            <Upload size={13} /> Bulk Upload
          </Link>
          <button onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-2.5 py-1 rounded-lg text-xs font-semibold shadow-sm transition">
            <Plus size={13} /> Pre-Onboard Candidate
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {STAT_META.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-3">
              <span className={clsx("w-10 h-10 rounded-xl grid place-items-center shrink-0", s.tile)}>
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide truncate">{s.label}</div>
                <div className="text-xl font-bold text-gray-900 leading-tight">{stats[i]}</div>
                <div className="text-[10px] text-gray-400">{s.sub}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter bar */}
      <div ref={barRef} className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-2.5 py-1.5 flex items-center gap-2 flex-1 min-w-[220px] max-w-md">
          <Search size={13} className="text-gray-400 shrink-0" />
          <input placeholder="Search candidates by name, email, or ID..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-[11px] bg-transparent focus:outline-none" />
        </div>

        {/* Filters summary pill */}
        <Dropdown id="filters" label="Filters" icon={Filter} active={activeFilterCount > 0} openKey={openKey} setOpenKey={setOpenKey}
          badge={activeFilterCount > 0 ? activeFilterCount : undefined}>
          {activeFilterCount === 0 ? (
            <p className="text-[11px] text-gray-400 px-1 py-1.5">No filters applied.</p>
          ) : (
            <div className="space-y-1.5">
              {deptSel.length > 0 && <ActiveRow label={`Department: ${deptSel.join(", ")}`} onClear={() => setDeptSel([])} />}
              {joiningSel && <ActiveRow label={`Joining: ${JOINING_LABEL[joiningSel]}`} onClear={() => setJoiningSel("")} />}
              {statusSel && <ActiveRow label={`BGV: ${statusSel}`} onClear={() => setStatusSel("")} />}
              {sourceSel && <ActiveRow label={`Source: ${sourceSel}`} onClear={() => setSourceSel("")} />}
              <button type="button" onClick={clearAll} className="w-full text-center text-[11px] font-medium text-red-600 hover:underline pt-1">
                Clear all filters
              </button>
            </div>
          )}
        </Dropdown>

        {/* Department (multi) */}
        <Dropdown id="dept" label="Department" icon={Building2} active={deptSel.length > 0} openKey={openKey} setOpenKey={setOpenKey}>
          {deptOptions.length === 0 ? <p className="text-[11px] text-gray-400 px-1 py-1">No departments</p> : (
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {deptOptions.map((d) => (
                <label key={d} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer px-1 py-1 rounded hover:bg-gray-50">
                  <input type="checkbox" className="accent-green-600" checked={deptSel.includes(d)}
                    onChange={() => setDeptSel((s) => s.includes(d) ? s.filter((x) => x !== d) : [...s, d])} />
                  {d}
                </label>
              ))}
            </div>
          )}
        </Dropdown>

        {/* Joining Date (single) */}
        <Dropdown id="joining" label="Joining Date" icon={Calendar} active={!!joiningSel} openKey={openKey} setOpenKey={setOpenKey}>
          <RadioList
            value={joiningSel}
            onChange={(v) => { setJoiningSel(v as typeof joiningSel); setOpenKey(null); }}
            options={[["", "Any time"], ["week", "This week"], ["month", "This month"], ["tbd", "Date TBD"]]}
          />
        </Dropdown>

        {/* Status = BGV status (single) */}
        <Dropdown id="status" label="Status" active={!!statusSel} openKey={openKey} setOpenKey={setOpenKey}>
          <RadioList
            value={statusSel}
            onChange={(v) => { setStatusSel(v as typeof statusSel); setOpenKey(null); }}
            options={[["", "Any status"], ["Pending", "Pending"], ["In Progress", "In Progress"], ["Completed", "Completed"]]}
          />
        </Dropdown>

        {/* Source (single) */}
        <Dropdown id="source" label="Source" active={!!sourceSel} openKey={openKey} setOpenKey={setOpenKey}>
          <RadioList
            value={sourceSel}
            onChange={(v) => { setSourceSel(v); setOpenKey(null); }}
            options={[["", "Any source"], ...sourceOptions.map((s) => [s, spaceCase(s)] as [string, string])]}
          />
        </Dropdown>

        <button type="button" onClick={clearAll}
          className="inline-flex items-center gap-1.5 ml-auto text-xs font-medium text-green-700 hover:text-green-800 px-2 py-2">
          <RotateCcw size={13} /> Clear All
        </button>
      </div>

      {/* Cards */}
      {isLoading ? <SkeletonTable rows={6} cols={3} /> : total === 0 ? (
        <div className="surface-card p-10 text-center text-gray-500">
          <Users size={30} className="mx-auto mb-2 text-gray-300" />
          <p>{activeFilterCount > 0 || search ? "No candidates match your filters." : "No one in pre-onboarding right now."}</p>
          <p className="text-xs mt-1">{activeFilterCount > 0 || search ? "Try clearing some filters." : "Candidates appear here once their offer is accepted and they're converted to a pre-hire."}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {pageRows.map((e, i) => {
              const t = THEMES[i % THEMES.length];
              const jd = joinDate(e.dateOfJoining);
              return (
                <Link key={e.id} href={`/onboarding/${e.id}`}
                  className="group bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 hover:shadow-md hover:border-gray-200 transition">
                  {/* Top row */}
                  <div className="flex items-start gap-2.5">
                    <div className="relative shrink-0">
                      <span className={clsx("w-10 h-10 rounded-full grid place-items-center text-xs font-bold", t.avatar)}>{initials(e)}</span>
                      <span className={clsx("absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white", t.dot)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-gray-900 truncate">{fullName(e)}</div>
                      <div className="text-[11px] text-gray-400 truncate">{e.employeeCode}</div>
                      <span className={clsx("inline-flex items-center mt-1 px-2 py-0.5 rounded-md text-[10px] font-medium", t.pill)}>
                        {jd ? `Joining: ${jd}` : "Joining date TBD"}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 shrink-0" />
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-x-3.5 gap-y-1 flex-wrap mt-2.5 text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1"><Building2 size={12} className="text-gray-400" />{e.department?.name ?? "—"}</span>
                    <span className="inline-flex items-center gap-1"><Clock size={12} className="text-gray-400" />{spaceCase(e.employmentType)}</span>
                    <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-gray-400" />{e.workLocation}</span>
                  </div>

                  {/* Progress row */}
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Stage Progress</div>
                      <ProgressRing pct={e.progressPct} color={t.ring} track={t.track} />
                    </div>
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Tasks</div>
                      <div className={clsx("text-[13px] font-bold", t.val)}>{e.taskDone} / {e.taskTotal}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">BGV Status</div>
                      {e.bgvStatus ? (
                        <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium ring-1", t.badge)}>{e.bgvStatus}</span>
                      ) : (
                        <span className="text-[11px] text-gray-400">—</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Footer / pagination */}
          <div className="flex items-center justify-between gap-3 mt-5 flex-wrap text-xs text-gray-500">
            <span>Showing {from} to {to} of {total} candidates</span>
            <div className="flex items-center gap-1.5">
              <button type="button" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="w-7 h-7 grid place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white">
                <ChevronLeft size={14} />
              </button>
              <span className="min-w-7 h-7 px-2 grid place-items-center rounded-lg bg-green-600 text-white text-xs font-semibold">{safePage}</span>
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="w-7 h-7 grid place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white">
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span>Show</span>
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
                className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-200">
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span>per page</span>
            </div>
          </div>
        </>
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

const JOINING_LABEL: Record<string, string> = { week: "This week", month: "This month", tbd: "Date TBD" };

/** Small labelled dropdown chip used across the filter bar. */
function Dropdown({
  id, label, icon: Icon, active, badge, openKey, setOpenKey, children,
}: {
  id: string; label: string; icon?: React.ElementType;
  active: boolean; badge?: number; openKey: string | null; setOpenKey: (k: string | null) => void;
  children: React.ReactNode;
}) {
  const open = openKey === id;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpenKey(open ? null : id)}
        className={clsx("inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition",
          active ? "border-green-300 bg-green-50 text-green-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50")}>
        {Icon && <Icon size={13} />} {label}
        {badge != null && <span className="px-1.5 rounded-full bg-green-600 text-white text-[10px] font-bold">{badge}</span>}
        <ChevronDown size={12} className="text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-2">
          {children}
        </div>
      )}
    </div>
  );
}

function RadioList({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="space-y-0.5">
      {options.map(([v, label]) => (
        <button key={v || "any"} type="button" onClick={() => onChange(v)}
          className={clsx("w-full text-left text-xs px-2 py-1.5 rounded transition",
            value === v ? "bg-green-50 text-green-700 font-medium" : "text-gray-700 hover:bg-gray-50")}>
          {label}
        </button>
      ))}
    </div>
  );
}

function ActiveRow({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px] text-gray-700 px-1">
      <span className="truncate">{label}</span>
      <button type="button" onClick={onClear} className="text-gray-400 hover:text-red-600 shrink-0">×</button>
    </div>
  );
}
