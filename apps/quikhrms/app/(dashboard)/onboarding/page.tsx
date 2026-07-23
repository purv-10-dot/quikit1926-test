"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Select } from "@/components/hrms/ui/select";
import { Plus, Search, Eye, EyeOff, ArrowUpDown, Edit2, Send, Mail, Upload, Download } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { useToast } from "@/components/hrms/toast";
import { exportCsv as exportCsvFile, fmtDate, formatGroup, formatAddress, type CsvColumn } from "@/lib/utils/csv";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import { AddCandidateWizard } from "./_components/add-candidate-wizard";

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

  const [showAdd, setShowAdd] = useState(false);
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
        <div className="flex items-center justify-end mb-4 gap-3 flex-wrap">
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
            <button onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition">
              <Plus size={13} /> Onboard Candidate
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-3 py-2 flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input placeholder="Search candidates..." value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-table-head text-gray-600 border-b border-gray-200">
                <tr>
                  <th className="w-10 px-4 py-2.5">
                    <Edit2 size={12} className="text-gray-400" />
                  </th>
                  <th className="w-10 px-4 py-2.5">
                    <input type="checkbox" checked={selected.size === filteredCandidates.length && filteredCandidates.length > 0} onChange={toggleAll} />
                  </th>
                  <HeaderCell label="First name" />
                  <HeaderCell label="Last name" />
                  <HeaderCell label="Email ID" />
                  <HeaderCell label="Official Email" />
                  <HeaderCell label="Onboarding Status" />
                  <HeaderCell label="Department" />
                  <HeaderCell label="Source of Hire" />
                  <HeaderCell label="PAN card number" action={
                    <button onClick={() => setRevealPan((v) => !v)} className="text-gray-400 hover:text-gray-600">
                      {revealPan ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  } />
                  <HeaderCell label="Aadhaar card number" action={
                    <button onClick={() => setRevealAadhaar((v) => !v)} className="text-gray-400 hover:text-gray-600">
                      {revealAadhaar ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  } />
                  <HeaderCell label="UAN number" action={<Eye size={12} className="text-gray-400" />} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, r) => (
                    <tr key={`sk-${r}`}>
                      {Array.from({ length: 12 }).map((__, c) => (
                        <td key={c} className="px-4 py-2.5"><SkeletonLine w="80%" h={10} /></td>
                      ))}
                    </tr>
                  ))
                ) : filteredCandidates.length === 0 ? (
                  <tr><td colSpan={12} className="text-center py-12 text-gray-500">{activeFilterCount > 0 ? "No candidates match filters." : "No candidates. Click \"Onboard Candidate\" to get started."}</td></tr>
                ) : filteredCandidates.map((c, i) => (
                  <tr key={c.id} onClick={() => router.push(`/onboarding/${c.id}`)} className="row-stagger hover:bg-gray-50 cursor-pointer" style={{ ["--i" as never]: Math.min(i, 10) }}>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={c.onboardingInstanceId ? `/onboarding/${c.id}` : "#"} className="text-[13px] font-medium text-gray-900 hover:text-[#22c55e]">
                        {c.firstName}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-gray-900">{c.lastName}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-gray-700">{truncate(c.personalEmail ?? "", 22)}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{truncate(c.workEmail, 22)}</td>
                    <td className="px-4 py-2.5">
                      <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium", statusColors[c.onboardingStatus] ?? "bg-gray-100 text-gray-600")}>
                        {c.onboardingStatus}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{c.department ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-700">{c.sourceOfHire ?? "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{mask(c.panNumber, revealPan, 10)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{mask(c.aadhaarNumber, revealAadhaar, 10)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{mask(c.uanNumber, false, 9)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between text-xs">
            <div>
              Total Record Count : <span className="text-[#22c55e] font-medium">{total}</span>
            </div>
            <div className="flex items-center gap-3">
              <Select
                value="10"
                onChange={() => {}}
                size="sm"
                options={[
                  { value: "10", label: "10" },
                  { value: "25", label: "25" },
                  { value: "50", label: "50" },
                  { value: "100", label: "100" },
                ]}
                className="w-20"
              />
              <span className="text-gray-500">1 - {Math.min(total, 10)}</span>
              <button className="p-1 border border-[var(--border)] rounded hover:bg-gray-50">‹</button>
              <button className="p-1 border border-[var(--border)] rounded hover:bg-gray-50">›</button>
            </div>
          </div>
        </div>
      </div>

      <AddCandidateWizard
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => setShowAdd(false)}
      />

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
