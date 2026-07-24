"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Select } from "@/components/hrms/ui/select";
import { Plus, Search, Eye, EyeOff, ArrowUpDown, Edit2, Send, Mail, Upload, Download, ArrowRight, Filter } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { useToast } from "@/components/hrms/toast";
import { exportCsv as exportCsvFile, fmtDate, formatGroup, formatAddress, type CsvColumn } from "@/lib/utils/csv";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";

type SourceOfHire = "Referral" | "JobPortal" | "LinkedIn" | "Agency" | "Campus" | "Direct" | "Other";

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
}

const STATUSES = ["NotStarted", "InProgress", "OnboardCompleted", "OnboardCancelled"];
const SOURCES: SourceOfHire[] = ["Referral", "JobPortal", "LinkedIn", "Agency", "Campus", "Direct", "Other"];

const statusColors: Record<string, string> = {
  NotStarted: "bg-gray-100 text-gray-600",
  InProgress: "bg-[#dcfce7] text-[#16a34a]",
  OnboardCompleted: "bg-green-100 text-green-700",
  OnboardCancelled: "bg-red-100 text-red-600",
};

export default function OnboardingCandidatesPage() {
  const api = useApiClient();
  const router = useRouter();
  const toast = useToast();

  const [search, setSearch] = useState("");
  const [revealPan, setRevealPan] = useState(false);
  const [revealAadhaar, setRevealAadhaar] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [filters, setFilters] = useState<{ status: string[]; source: string[] }>({ status: [], source: [] });
  const filterRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilters(false);
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setShowMore(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };

  interface NewJoinee {
    id: string;
    firstName: string;
    lastName: string;
    employeeCode: string;
    workEmail: string;
    personalEmail: string | null;
    dateOfJoining: string;
    jobTitle: string | null;
  }

  const qs = new URLSearchParams();
  qs.set("limit", "100");
  if (search) qs.set("search", search);

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding", "candidates", search],
    queryFn: () => api.get<Candidate[]>(`/api/v1/hrms/onboarding/candidates?${qs.toString()}`),
  });


  const candidates = data?.data ?? [];
  const filteredCandidates = candidates.filter((c) => {
    if (filters.status.length && !filters.status.includes(c.onboardingStatus)) return false;
    if (filters.source.length && !filters.source.includes(c.sourceOfHire ?? "")) return false;
    return true;
  });
  const total = filteredCandidates.length;
  const activeFilterCount = filters.status.length + filters.source.length;

  // Export EVERY captured field. Nested groups (addresses, emergency contacts,
  // education, experience, family, certifications) each collapse into one
  // readable cell via formatGroup/formatAddress. Columns mirror the Add
  // Candidate form so a downloaded CSV round-trips all the input data.
  const CANDIDATE_COLUMNS: CsvColumn<Candidate>[] = [
    { header: "Employee Code", value: (c) => c.employeeCode },
    { header: "First Name", value: (c) => c.firstName },
    { header: "Last Name", value: (c) => c.lastName },
    { header: "Email ID (Work)", value: (c) => c.workEmail },
    { header: "Official Email (Personal)", value: (c) => c.personalEmail },
    { header: "Phone", value: (c) => c.personalPhone },
    { header: "Photo URL", value: (c) => c.profilePhoto },
    { header: "Status", value: (c) => c.onboardingStatus },
    { header: "Department", value: (c) => c.department },
    { header: "Designation", value: (c) => c.designation ?? c.jobTitle },
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

  const exportCsv = () => {
    exportCsvFile("candidates", CANDIDATE_COLUMNS, filteredCandidates);
    setShowMore(false);
  };

  // Excel export mirrors the exact CSV columns (same headers + same value
  // formatting: dates via fmtDate, nested groups via formatGroup/formatAddress).
  const excelColumns = CANDIDATE_COLUMNS.map((c, i) => ({
    header: c.header,
    key: `c${i}`,
    width: Math.min(30, Math.max(12, c.header.length + 4)),
  }));
  const excelRows = filteredCandidates.map((c) => {
    const row: Record<string, unknown> = {};
    CANDIDATE_COLUMNS.forEach((col, i) => {
      const v = col.value(c);
      row[`c${i}`] = v == null ? "" : v;
    });
    return row;
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === filteredCandidates.length) setSelected(new Set());
    else setSelected(new Set(filteredCandidates.map((c) => c.id)));
  };

  const mask = (value: string | null, reveal: boolean, len = 10) => {
    if (!value) return "—";
    if (reveal) return value;
    return "*".repeat(Math.min(len, value.length));
  };

  return (
    <div className="w-full px-5 py-4">
      <h1 className="text-page-title text-gray-900 mb-5">Onboarding</h1>

      <div className="">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2" ref={filterRef}>
            <div className="relative">
              <button type="button" onClick={() => setShowFilters((v) => !v)}
                className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition",
                  activeFilterCount > 0 ? "border-green-300 bg-green-50 text-green-700" : "border-gray-300 text-gray-700 hover:bg-gray-50")}>
                <Filter size={14} /> Filters
                {activeFilterCount > 0 && <span className="ml-0.5 px-1.5 rounded-full bg-green-600 text-white text-[10px] font-bold">{activeFilterCount}</span>}
              </button>
              {showFilters && (
                <div className="absolute left-0 top-full mt-1.5 z-20 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Onboarding Status</div>
                    <div className="space-y-1">
                      {STATUSES.map((s) => (
                        <label key={s} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                          <input type="checkbox" className="accent-green-600" checked={filters.status.includes(s)}
                            onChange={() => setFilters((f) => ({ ...f, status: f.status.includes(s) ? f.status.filter((x) => x !== s) : [...f.status, s] }))} />
                          {s}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-2.5">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Source of Hire</div>
                    <div className="space-y-1">
                      {SOURCES.map((s) => (
                        <label key={s} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                          <input type="checkbox" className="accent-green-600" checked={filters.source.includes(s)}
                            onChange={() => setFilters((f) => ({ ...f, source: f.source.includes(s) ? f.source.filter((x) => x !== s) : [...f.source, s] }))} />
                          {s}
                        </label>
                      ))}
                    </div>
                  </div>
                  {activeFilterCount > 0 && (
                    <button type="button" onClick={() => setFilters({ status: [], source: [] })}
                      className="w-full text-center text-[11px] font-medium text-red-600 hover:underline pt-1">
                      Clear all filters
                    </button>
                  )}
                </div>
              )}
            </div>
            {filters.status.map((s) => (
              <span key={`fs-${s}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-50 text-green-700 text-[11px] font-medium">
                {s}
                <button onClick={() => setFilters((f) => ({ ...f, status: f.status.filter((x) => x !== s) }))} className="hover:text-green-900">×</button>
              </span>
            ))}
            {filters.source.map((s) => (
              <span key={`fr-${s}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-medium">
                {s}
                <button onClick={() => setFilters((f) => ({ ...f, source: f.source.filter((x) => x !== s) }))} className="hover:text-blue-900">×</button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportCsv} disabled={filteredCandidates.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-50 transition disabled:opacity-50">
              <Download size={14} /> CSV
            </button>
            <ExcelExportButton filename="onboarding" sheetName="Candidates" columns={excelColumns} rows={excelRows} label="Excel" />
            <Link href="/onboarding/candidates/bulk-import"
              className="inline-flex items-center gap-1.5 border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition">
              <Upload size={13} /> Bulk Upload
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {([
            ["Not Started", "NotStarted"],
            ["In Progress", "InProgress"],
            ["Completed", "OnboardCompleted"],
            ["Cancelled", "OnboardCancelled"],
          ] as const).map(([label, key]) => (
            <div key={key} className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
              <div className="text-xs text-gray-500 uppercase">{label}</div>
              <div className="text-base md:text-lg font-bold text-gray-900 mt-1">
                {candidates.filter((c) => c.onboardingStatus === key).length}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 mb-4 flex items-center gap-2 max-w-md">
          <Search size={14} className="text-gray-400" />
          <input placeholder="Search candidates…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 text-sm focus:outline-none" />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="surface-card p-4 flex items-center gap-3">
                <SkeletonLine w={40} h={40} />
                <div className="flex-1 space-y-1.5">
                  <SkeletonLine w="60%" h={12} />
                  <SkeletonLine w="45%" h={10} />
                  <SkeletonLine w="70%" h={10} />
                </div>
              </div>
            ))}
          </div>
        ) : filteredCandidates.length === 0 ? (
          <div className="surface-card p-8 text-center text-gray-500">
            <Plus size={30} className="mx-auto mb-2 text-gray-300" />
            <p>{activeFilterCount > 0 ? "No candidates match filters." : "No candidates yet."}</p>
            <p className="text-xs mt-1">Candidates move here from Pre-Onboarding once they&rsquo;re ready for Day 1.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredCandidates.map((c, i) => {
                const name = `${c.firstName} ${c.lastName}`.trim();
                const inits = `${c.firstName?.[0] ?? ""}${c.lastName?.[0] ?? ""}`.toUpperCase() || "?";
                const role = c.designation ?? c.jobTitle;
                return (
                  <Link key={c.id} href={`/onboarding/${c.id}`}
                    className="row-stagger surface-card p-4 flex items-center gap-3 hover:border-[#166534]/30 hover:shadow-md transition group"
                    style={{ ["--i" as never]: Math.min(i, 10) }}>
                    <span className="w-10 h-10 rounded-full bg-[#166534]/10 text-[#166534] grid place-items-center text-sm font-bold shrink-0">{inits}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="text-[13px] font-semibold text-gray-900 truncate group-hover:text-[#166534]">{name}</div>
                        <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0", statusColors[c.onboardingStatus] ?? "bg-gray-100 text-gray-600")}>
                          {c.onboardingStatus}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {c.employeeCode}{role ? ` · ${role}` : ""}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                        {c.dateOfJoining ? `Joins ${new Date(c.dateOfJoining).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : "Joining date TBD"}
                        {c.department ? ` · ${c.department}` : ""}
                      </div>
                    </div>
                    <ArrowRight size={15} className="text-gray-300 shrink-0 group-hover:text-[#166534]" />
                  </Link>
                );
              })}
            </div>
            <div className="mt-4 text-xs text-gray-500">
              Total Record Count : <span className="text-[#22c55e] font-medium">{total}</span>
            </div>
          </>
        )}
      </div>

    </div>
  );
}

function HeaderCell({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-left font-semibold text-gray-700 whitespace-nowrap">
      <div className="flex items-center gap-1.5">
        <span>{label}</span>
        <ArrowUpDown size={10} className="text-gray-400" />
        {action}
      </div>
    </th>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 3) + "..." : s;
}
