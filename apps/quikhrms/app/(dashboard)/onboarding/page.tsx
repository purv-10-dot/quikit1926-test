"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import {
  UserCheck, Search, Upload, Download, Filter, ChevronRight, ChevronLeft,
  Building2, Clock, MapPin, RotateCcw, Calendar, CircleDashed, Loader, CheckCircle2, XCircle,
} from "lucide-react";
import { clsx } from "clsx";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { exportCsv as exportCsvFile, fmtDate, formatGroup, formatAddress, type CsvColumn } from "@/lib/utils/csv";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import { PageBackground } from "@/components/hrms/page-background";
import {
  BOARDING_THEMES, ProgressRing, FilterDropdown, RadioList, ActiveFilterRow, CheckboxList,
  spaceCase, niceDate,
} from "@/components/hrms/boarding/ui";

type SourceOfHire = "Referral" | "JobPortal" | "LinkedIn" | "Agency" | "Campus" | "Direct" | "Other";
type BgvStatus = "Pending" | "In Progress" | "Completed" | null;

interface AddressJson { line1?: string; line2?: string; city?: string; state?: string; country?: string; postalCode?: string }
interface EmergencyContactJson { name?: string; relationship?: string; phone?: string; email?: string; address?: string }
interface EducationJson { schoolName?: string; degree?: string; fieldOfStudy?: string; completionDate?: string; notes?: string }
interface ExperienceJson { occupation?: string; company?: string; summary?: string; duration?: string; currentlyWorkHere?: boolean }
interface CertificationJson { name?: string; courseName?: string; issuingAuthority?: string; year?: string; expiryDate?: string; credentialUrl?: string }
interface FamilyMemberJson { name?: string; relation?: string; dob?: string; occupation?: string }

interface Candidate {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  personalEmail: string | null;
  workEmail: string;
  personalPhone: string | null;
  profilePhoto: string | null;
  department: string | null;
  departmentId: string | null;
  designation: string | null;
  jobTitle: string | null;
  officeLocation: string | null;
  reportingManager: string | null;
  sourceOfHire: SourceOfHire | null;
  dateOfJoining: string;
  tentativeJoiningDate: string | null;
  panNumber: string | null;
  aadhaarNumber: string | null;
  uanNumber: string | null;
  previousExperience: number | null;
  currentSalary: number | null;
  ctcLpa: number | null;
  highestQualification: string | null;
  skillSet: string | null;
  additionalInfo: string | null;
  offerLetterUrl: string | null;
  currentAddress: AddressJson | null;
  permanentAddress: AddressJson | null;
  emergencyContacts: EmergencyContactJson[] | null;
  educations: EducationJson[] | null;
  pastExperiences: ExperienceJson[] | null;
  certifications: CertificationJson[] | null;
  familyMembers: FamilyMemberJson[] | null;
  onboardingStatus: string;
  onboardingInstanceId: string | null;
  employmentType: string;
  workLocation: string;
  taskDone: number;
  taskTotal: number;
  progressPct: number;
  bgvStatus: BgvStatus;
}

const SOURCES: SourceOfHire[] = ["Referral", "JobPortal", "LinkedIn", "Agency", "Campus", "Direct", "Other"];
const STATUS_META = [
  { key: "NotStarted",        label: "Not Started", icon: CircleDashed, tile: "bg-gray-100 text-gray-500" },
  { key: "InProgress",        label: "In Progress", icon: Loader,       tile: "bg-blue-100 text-blue-600" },
  { key: "OnboardCompleted",  label: "Completed",   icon: CheckCircle2, tile: "bg-green-100 text-green-600" },
  { key: "OnboardCancelled",  label: "Cancelled",   icon: XCircle,      tile: "bg-rose-100 text-rose-600" },
] as const;
const STATUS_LABEL: Record<string, string> = Object.fromEntries(STATUS_META.map((s) => [s.key, s.label]));
const PAGE_SIZES = [12, 24, 48];

export default function OnboardingCandidatesPage() {
  const api = useApiClient();
  const [search, setSearch] = useState("");
  const [deptSel, setDeptSel] = useState<string[]>([]);
  const [joiningSel, setJoiningSel] = useState<"" | "week" | "month" | "tbd">("");
  const [statusSel, setStatusSel] = useState("");
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

  const qs = new URLSearchParams();
  qs.set("limit", "100");
  if (search) qs.set("search", search);

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding", "candidates", search],
    queryFn: () => api.get<Candidate[]>(`/api/v1/hrms/onboarding/candidates?${qs.toString()}`),
  });
  const rows = data?.data ?? [];

  const deptOptions = Array.from(new Set(rows.map((c) => c.department).filter(Boolean) as string[])).sort();
  const sourceOptions = Array.from(new Set(rows.map((c) => c.sourceOfHire).filter(Boolean) as string[])).sort();

  const nowDay = new Date(); nowDay.setHours(0, 0, 0, 0);
  const weekEnd = new Date(nowDay); weekEnd.setDate(nowDay.getDate() + 7);
  const monthEnd = new Date(nowDay.getFullYear(), nowDay.getMonth() + 1, 0);
  const inRange = (d: string | null, end: Date) => !!d && new Date(d) >= nowDay && new Date(d) <= end;

  const filtered = rows.filter((c) => {
    if (deptSel.length && !deptSel.includes(c.department ?? "")) return false;
    if (joiningSel === "tbd" && c.dateOfJoining) return false;
    if (joiningSel === "week" && !inRange(c.dateOfJoining, weekEnd)) return false;
    if (joiningSel === "month" && !inRange(c.dateOfJoining, monthEnd)) return false;
    if (statusSel && c.onboardingStatus !== statusSel) return false;
    if (sourceSel && c.sourceOfHire !== sourceSel) return false;
    return true;
  });

  const activeFilterCount = (deptSel.length ? 1 : 0) + (joiningSel ? 1 : 0) + (statusSel ? 1 : 0) + (sourceSel ? 1 : 0);
  const clearAll = () => { setDeptSel([]); setJoiningSel(""); setStatusSel(""); setSourceSel(""); };

  useEffect(() => { setPage(1); }, [search, deptSel.join(","), joiningSel, statusSel, sourceSel, pageSize]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = total ? (safePage - 1) * pageSize + 1 : 0;
  const to = Math.min(safePage * pageSize, total);

  // Full-fidelity CSV/Excel export (every captured field, mirrors Add Candidate).
  const CANDIDATE_COLUMNS: CsvColumn<Candidate>[] = [
    { header: "Employee Code", value: (c) => c.employeeCode },
    { header: "First Name", value: (c) => c.firstName },
    { header: "Last Name", value: (c) => c.lastName },
    { header: "Email ID (Work)", value: (c) => c.workEmail },
    { header: "Official Email (Personal)", value: (c) => c.personalEmail },
    { header: "Phone", value: (c) => c.personalPhone },
    { header: "Status", value: (c) => c.onboardingStatus },
    { header: "Department", value: (c) => c.department },
    { header: "Designation", value: (c) => c.designation ?? c.jobTitle },
    { header: "Employment Type", value: (c) => spaceCase(c.employmentType) },
    { header: "Work Location", value: (c) => c.workLocation },
    { header: "Office Location", value: (c) => c.officeLocation },
    { header: "Reporting Manager", value: (c) => c.reportingManager },
    { header: "Source of Hire", value: (c) => c.sourceOfHire },
    { header: "Joining Date", value: (c) => fmtDate(c.dateOfJoining) },
    { header: "Tentative Joining Date", value: (c) => fmtDate(c.tentativeJoiningDate) },
    { header: "PAN Number", value: (c) => c.panNumber },
    { header: "Aadhaar Number", value: (c) => c.aadhaarNumber },
    { header: "UAN Number", value: (c) => c.uanNumber },
    { header: "Experience (months)", value: (c) => c.previousExperience },
    { header: "Current Salary", value: (c) => c.currentSalary },
    { header: "CTC (LPA)", value: (c) => c.ctcLpa },
    { header: "Highest Qualification", value: (c) => c.highestQualification },
    { header: "Skill Set", value: (c) => c.skillSet },
    { header: "Additional Info", value: (c) => c.additionalInfo },
    { header: "Offer Letter URL", value: (c) => c.offerLetterUrl },
    { header: "Present Address", value: (c) => formatAddress(c.currentAddress) },
    { header: "Permanent Address", value: (c) => formatAddress(c.permanentAddress) },
    { header: "Emergency Contacts", value: (c) => formatGroup(c.emergencyContacts, (x) => `${x.name ?? ""} (${x.relationship ?? ""}) ${x.phone ?? ""}${x.email ? ` ${x.email}` : ""}`) },
    { header: "Education", value: (c) => formatGroup(c.educations, (x) => `${x.degree ?? ""}${x.fieldOfStudy ? ` ${x.fieldOfStudy}` : ""}${x.schoolName ? `, ${x.schoolName}` : ""}${x.completionDate ? ` (${fmtDate(x.completionDate)})` : ""}`) },
    { header: "Experience", value: (c) => formatGroup(c.pastExperiences, (x) => `${x.occupation ?? ""}${x.company ? ` @ ${x.company}` : ""}${x.duration ? ` (${x.duration})` : ""}${x.currentlyWorkHere ? " [current]" : ""}`) },
    { header: "Family Members", value: (c) => formatGroup(c.familyMembers, (x) => `${x.name ?? ""} (${x.relation ?? ""})${x.occupation ? ` ${x.occupation}` : ""}${x.dob ? ` ${fmtDate(x.dob)}` : ""}`) },
    { header: "Certifications", value: (c) => formatGroup(c.certifications, (x) => `${x.name ?? ""}${x.issuingAuthority ? ` — ${x.issuingAuthority}` : ""}${x.year ? ` (${x.year})` : ""}`) },
  ];
  const excelColumns = CANDIDATE_COLUMNS.map((c, i) => ({ header: c.header, key: `c${i}`, width: Math.min(30, Math.max(12, c.header.length + 4)) }));
  const excelRows = filtered.map((c) => {
    const row: Record<string, unknown> = {};
    CANDIDATE_COLUMNS.forEach((col, i) => { const v = col.value(c); row[`c${i}`] = v == null ? "" : v; });
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
            <UserCheck size={16} />
          </span>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">Onboarding</h1>
            <p className="text-[11px] text-gray-500 mt-0.5 max-w-xl">
              New joiners moving through Day-1 setup — tasks, verification, and provisioning until they&rsquo;re fully onboarded.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => exportCsvFile("candidates", CANDIDATE_COLUMNS, filtered)} disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-medium shadow-sm hover:bg-gray-50 transition disabled:opacity-50">
            <Download size={13} /> CSV
          </button>
          <ExcelExportButton filename="onboarding" sheetName="Candidates" columns={excelColumns} rows={excelRows} label="Excel"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-medium shadow-sm hover:bg-gray-50 transition disabled:opacity-50" />
          <Link href="/onboarding/candidates/bulk-import"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-medium shadow-sm hover:bg-gray-50 transition">
            <Upload size={13} /> Bulk Upload
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {STATUS_META.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.key} className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-3">
              <span className={clsx("w-10 h-10 rounded-xl grid place-items-center shrink-0", s.tile)}>
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide truncate">{s.label}</div>
                <div className="text-xl font-bold text-gray-900 leading-tight">{rows.filter((c) => c.onboardingStatus === s.key).length}</div>
                <div className="text-[10px] text-gray-400">Candidates</div>
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

        <FilterDropdown id="filters" label="Filters" icon={Filter} active={activeFilterCount > 0} openKey={openKey} setOpenKey={setOpenKey}
          badge={activeFilterCount > 0 ? activeFilterCount : undefined}>
          {activeFilterCount === 0 ? (
            <p className="text-[11px] text-gray-400 px-1 py-1.5">No filters applied.</p>
          ) : (
            <div className="space-y-1.5">
              {deptSel.length > 0 && <ActiveFilterRow label={`Department: ${deptSel.join(", ")}`} onClear={() => setDeptSel([])} />}
              {joiningSel && <ActiveFilterRow label={`Joining: ${JOINING_LABEL[joiningSel]}`} onClear={() => setJoiningSel("")} />}
              {statusSel && <ActiveFilterRow label={`Status: ${STATUS_LABEL[statusSel] ?? statusSel}`} onClear={() => setStatusSel("")} />}
              {sourceSel && <ActiveFilterRow label={`Source: ${sourceSel}`} onClear={() => setSourceSel("")} />}
              <button type="button" onClick={clearAll} className="w-full text-center text-[11px] font-medium text-red-600 hover:underline pt-1">
                Clear all filters
              </button>
            </div>
          )}
        </FilterDropdown>

        <FilterDropdown id="dept" label="Department" icon={Building2} active={deptSel.length > 0} openKey={openKey} setOpenKey={setOpenKey}>
          <CheckboxList options={deptOptions} selected={deptSel} empty="No departments"
            onToggle={(d) => setDeptSel((s) => s.includes(d) ? s.filter((x) => x !== d) : [...s, d])} />
        </FilterDropdown>

        <FilterDropdown id="joining" label="Joining Date" icon={Calendar} active={!!joiningSel} openKey={openKey} setOpenKey={setOpenKey}>
          <RadioList value={joiningSel} onChange={(v) => { setJoiningSel(v as typeof joiningSel); setOpenKey(null); }}
            options={[["", "Any time"], ["week", "This week"], ["month", "This month"], ["tbd", "Date TBD"]]} />
        </FilterDropdown>

        <FilterDropdown id="status" label="Status" active={!!statusSel} openKey={openKey} setOpenKey={setOpenKey}>
          <RadioList value={statusSel} onChange={(v) => { setStatusSel(v); setOpenKey(null); }}
            options={[["", "Any status"], ...STATUS_META.map((s) => [s.key, s.label] as [string, string])]} />
        </FilterDropdown>

        <FilterDropdown id="source" label="Source" active={!!sourceSel} openKey={openKey} setOpenKey={setOpenKey}>
          <RadioList value={sourceSel} onChange={(v) => { setSourceSel(v); setOpenKey(null); }}
            options={[["", "Any source"], ...sourceOptions.map((s) => [s, spaceCase(s)] as [string, string])]} />
        </FilterDropdown>

        <button type="button" onClick={clearAll}
          className="inline-flex items-center gap-1.5 ml-auto text-xs font-medium text-green-700 hover:text-green-800 px-2 py-2">
          <RotateCcw size={13} /> Clear All
        </button>
      </div>

      {/* Cards */}
      {isLoading ? <SkeletonTable rows={6} cols={3} /> : total === 0 ? (
        <div className="surface-card p-10 text-center text-gray-500">
          <UserCheck size={30} className="mx-auto mb-2 text-gray-300" />
          <p>{activeFilterCount > 0 || search ? "No candidates match your filters." : "No candidates yet."}</p>
          <p className="text-xs mt-1">Candidates move here from Pre-Onboarding once they&rsquo;re ready for Day 1.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {pageRows.map((c, i) => {
              const t = BOARDING_THEMES[i % BOARDING_THEMES.length];
              const name = `${c.firstName} ${c.lastName}`.trim();
              const inits = `${c.firstName?.[0] ?? ""}${c.lastName?.[0] ?? ""}`.toUpperCase() || "?";
              const jd = niceDate(c.dateOfJoining);
              return (
                <Link key={c.id} href={`/onboarding/${c.id}`}
                  className="group bg-white rounded-xl border border-gray-100 shadow-sm p-3.5 hover:shadow-md hover:border-gray-200 transition">
                  <div className="flex items-start gap-2.5">
                    <div className="relative shrink-0">
                      <span className={clsx("w-10 h-10 rounded-full grid place-items-center text-xs font-bold", t.avatar)}>{inits}</span>
                      <span className={clsx("absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white", t.dot)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-bold text-gray-900 truncate">{name}</div>
                      <div className="text-[11px] text-gray-400 truncate">{c.employeeCode}</div>
                      <span className={clsx("inline-flex items-center mt-1 px-2 py-0.5 rounded-md text-[10px] font-medium", t.pill)}>
                        {jd ? `Joining: ${jd}` : "Joining date TBD"}
                      </span>
                    </div>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 shrink-0" />
                  </div>

                  <div className="flex items-center gap-x-3.5 gap-y-1 flex-wrap mt-2.5 text-[11px] text-gray-500">
                    <span className="inline-flex items-center gap-1"><Building2 size={12} className="text-gray-400" />{c.department ?? "—"}</span>
                    <span className="inline-flex items-center gap-1"><Clock size={12} className="text-gray-400" />{spaceCase(c.employmentType)}</span>
                    <span className="inline-flex items-center gap-1"><MapPin size={12} className="text-gray-400" />{c.workLocation}</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Stage Progress</div>
                      <ProgressRing pct={c.progressPct} color={t.ring} track={t.track} />
                    </div>
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Tasks</div>
                      <div className={clsx("text-[13px] font-bold", t.val)}>{c.taskDone} / {c.taskTotal}</div>
                    </div>
                    <div>
                      <div className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">BGV Status</div>
                      {c.bgvStatus ? (
                        <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium ring-1", t.badge)}>{c.bgvStatus}</span>
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
    </div>
  );
}

const JOINING_LABEL: Record<string, string> = { week: "This week", month: "This month", tbd: "Date TBD" };
