"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { Plus, Search, Filter, Maximize2, Minimize2, MoreHorizontal, Eye, EyeOff, ArrowUpDown, Edit2, Send, Mail, Download, RefreshCw, X } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { useToast } from "@/components/hrms/toast";
import { todayInput } from "@/lib/utils/date-input";
import { exportCsv as exportCsvFile, fmtDate, formatGroup, formatAddress, type CsvColumn } from "@/lib/utils/csv";

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

interface Department { id: string; name: string; }
interface Template { id: string; name: string; }

const VIEW_OPTIONS = ["Reportees + My Data", "View All Data", "My Data"];
const SOURCES: SourceOfHire[] = ["Referral", "JobPortal", "LinkedIn", "Agency", "Campus", "Direct", "Other"];
const STATUSES = ["NotStarted", "InProgress", "OnboardCompleted", "OnboardCancelled"];

const statusColors: Record<string, string> = {
  NotStarted: "bg-gray-100 text-gray-600",
  InProgress: "bg-[#dcfce7] text-[#16a34a]",
  OnboardCompleted: "bg-green-100 text-green-700",
  OnboardCancelled: "bg-red-100 text-red-600",
};

export default function OnboardingCandidatesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState(VIEW_OPTIONS[0]);
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

  const [form, setForm] = useState({
    firstName: "", lastName: "", personalEmail: "", workEmail: "",
    departmentId: "", sourceOfHire: "Direct" as SourceOfHire, dateOfJoining: "",
    panNumber: "", aadhaarNumber: "", uanNumber: "", templateId: "",
  });

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
  const [mailConfirm, setMailConfirm] = useState<NewJoinee | null>(null);

  const qs = new URLSearchParams();
  qs.set("limit", "100");
  if (search) qs.set("search", search);

  const { data, isLoading } = useQuery({
    queryKey: ["onboarding", "candidates", search],
    queryFn: () => api.get<Candidate[]>(`/api/v1/hrms/onboarding/candidates?${qs.toString()}`),
  });

  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<Department[]>("/api/v1/hrms/departments?limit=100"),
  });

  const { data: templates } = useQuery({
    queryKey: ["onboarding", "templates"],
    queryFn: () => api.get<Template[]>("/api/v1/hrms/onboarding/templates?isActive=true&limit=100"),
  });

  const addMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ employee: NewJoinee; draft?: boolean }>("/api/v1/hrms/onboarding/candidates", body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      setShowAdd(false);
      setForm({ firstName: "", lastName: "", personalEmail: "", workEmail: "", departmentId: "", sourceOfHire: "Direct", dateOfJoining: "", panNumber: "", aadhaarNumber: "", uanNumber: "", templateId: "" });
      const emp = res?.data?.employee;
      if (emp && !res?.data?.draft) setMailConfirm(emp);
    },
  });

  const sendWelcomeMailMut = useMutation({
    mutationFn: ({ employeeId }: { employeeId: string }) =>
      api.post("/api/v1/hrms/mail/welcome", { employeeId }),
    onSuccess: () => { setMailConfirm(null); },
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
      <div className="border-b border-gray-100 mb-4">
        <button className="text-[13px] text-[#22c55e] font-semibold border-b-2 border-[#22c55e] py-2 -mb-px">Candidate</button>
      </div>

      <div className="">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Select
              value="Candidate View"
              onChange={() => {}}
              options={[{ value: "Candidate View", label: "Candidate View" }]}
              className="w-48"
            />
            <button className="text-xs text-[#22c55e] font-medium px-2 py-1 rounded hover:bg-green-50 transition">Edit</button>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs text-[#22c55e] font-medium px-2 py-1 rounded hover:bg-green-50 transition">View All Data</button>
            <Select
              value={view}
              onChange={(v) => setView(v)}
              options={VIEW_OPTIONS.map((v) => ({ value: v, label: v }))}
              className="w-44"
            />
            <Link href="/onboarding/candidates/new"
              className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-xs font-medium shadow-sm transition">
              <Plus size={13} /> Add Candidate
            </Link>
            <div className="inline-flex items-center bg-white border border-[var(--border)] rounded-lg shadow-sm divide-x divide-gray-200">
              <button
                onClick={toggleFullscreen}
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                className="p-2 text-gray-600 hover:bg-gray-50 hover:text-[#22c55e] transition rounded-l-lg"
              >
                {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </button>
              <div ref={filterRef} className="relative">
                <button
                  onClick={() => { setShowFilters((v) => !v); setShowMore(false); }}
                  title="Filters"
                  className={clsx("relative p-2 text-gray-600 hover:bg-gray-50 hover:text-[#22c55e] transition", showFilters && "bg-green-50 text-[#22c55e]")}
                >
                  <Filter size={12} />
                  {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-green-600 text-white text-[11px] font-semibold w-4 h-4 rounded-full flex items-center justify-center">{activeFilterCount}</span>
                  )}
                </button>
                {showFilters && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-20 p-3">
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                      <h4 className="text-[13px] font-semibold text-gray-900">Filters</h4>
                      {activeFilterCount > 0 && (
                        <button onClick={() => setFilters({ status: [], source: [] })} className="text-xs text-[#22c55e] font-medium hover:underline">Clear all</button>
                      )}
                    </div>
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Status</p>
                      <div className="space-y-1">
                        {STATUSES.map((s) => (
                          <label key={s} className="flex items-center gap-2 text-xs text-gray-700 hover:bg-gray-50 rounded px-1 py-0.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={filters.status.includes(s)}
                              onChange={(e) => {
                                const next = e.target.checked ? [...filters.status, s] : filters.status.filter((x) => x !== s);
                                setFilters({ ...filters, status: next });
                              }}
                            />
                            {s}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">Source</p>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {SOURCES.map((s) => (
                          <label key={s} className="flex items-center gap-2 text-xs text-gray-700 hover:bg-gray-50 rounded px-1 py-0.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={filters.source.includes(s)}
                              onChange={(e) => {
                                const next = e.target.checked ? [...filters.source, s] : filters.source.filter((x) => x !== s);
                                setFilters({ ...filters, source: next });
                              }}
                            />
                            {s}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div ref={moreRef} className="relative">
                <button
                  onClick={() => { setShowMore((v) => !v); setShowFilters(false); }}
                  title="More options"
                  className={clsx("p-2 text-gray-600 hover:bg-gray-50 hover:text-[#22c55e] transition rounded-r-lg", showMore && "bg-green-50 text-[#22c55e]")}
                >
                  <MoreHorizontal size={12} />
                </button>
                {showMore && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-xl z-20 py-1">
                    <button
                      onClick={() => { qc.invalidateQueries({ queryKey: ["onboarding"] }); setShowMore(false); }}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <RefreshCw size={13} /> Refresh
                    </button>
                    <button
                      onClick={exportCsv}
                      className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <Download size={13} /> Export CSV
                    </button>
                    {selected.size > 0 && (
                      <button
                        onClick={() => { setSelected(new Set()); setShowMore(false); }}
                        className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 border-t border-gray-100"
                      >
                        <X size={13} /> Clear Selection ({selected.size})
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
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
                  <tr><td colSpan={12} className="text-center py-12 text-gray-500">{activeFilterCount > 0 ? "No candidates match filters." : "No candidates. Click \"Add Candidate\" to get started."}</td></tr>
                ) : filteredCandidates.map((c, i) => (
                  <tr key={c.id} className="row-stagger hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                    <td className="px-4 py-2.5"></td>
                    <td className="px-4 py-2.5">
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

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Candidate">
        <form onSubmit={(e) => {
          e.preventDefault();
          addMut.mutate({
            ...form,
            departmentId: form.departmentId || undefined,
            templateId: form.templateId || undefined,
            personalEmail: form.personalEmail || undefined,
          });
        }} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">First Name *</label>
              <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Last Name *</label>
              <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Personal Email</label>
              <input type="email" value={form.personalEmail} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Official Email *</label>
              <input type="email" required value={form.workEmail} onChange={(e) => setForm({ ...form, workEmail: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Department</label>
              <Select
                value={form.departmentId}
                onChange={(v) => setForm({ ...form, departmentId: v })}
                placeholder="Select..."
                searchable
                options={(depts?.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
              /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Source of Hire</label>
              <Select
                value={form.sourceOfHire}
                onChange={(v) => setForm({ ...form, sourceOfHire: v as SourceOfHire })}
                options={SOURCES.map((s) => ({ value: s, label: s }))}
              /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Date of Joining *</label>
              <input type="date" required value={form.dateOfJoining} min={todayInput()} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Onboarding Template</label>
              <Select
                value={form.templateId}
                onChange={(v) => setForm({ ...form, templateId: v })}
                placeholder="Use default tasks"
                searchable
                options={(templates?.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
              /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">PAN Number</label>
              <input value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase() })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm font-mono" maxLength={10} /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Aadhaar Number</label>
              <input value={form.aadhaarNumber} onChange={(e) => setForm({ ...form, aadhaarNumber: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm font-mono" maxLength={12} /></div>
            <div className="col-span-2"><label className="block text-xs font-medium text-gray-700 mb-1">UAN Number</label>
              <input value={form.uanNumber} onChange={(e) => setForm({ ...form, uanNumber: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm font-mono" maxLength={12} /></div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 sticky bottom-0 bg-white">
            <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" disabled={addMut.isPending} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
              {addMut.isPending ? "Adding..." : "Add Candidate"}
            </button>
          </div>
        </form>
      </Modal>

      {mailConfirm && (() => {
        const e = mailConfirm;
        const to = e.personalEmail || e.workEmail;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
              onClick={() => !sendWelcomeMailMut.isPending && setMailConfirm(null)} />
            <div className="relative bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 w-full max-w-md mx-4 overflow-hidden">
              <div className="p-4">
                <div className="flex items-start gap-4">
                  <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-full ring-4 bg-emerald-50 ring-emerald-50/60">
                    <Mail className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-900">Send Welcome Email?</h3>
                    <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">New joinee will receive a welcome email with employee code, joining date and onboarding details.</p>
                    <div className="mt-3 text-xs bg-slate-50 border border-slate-100 rounded-md px-2.5 py-2 text-slate-600 space-y-0.5">
                      <div className="font-semibold text-slate-800">{e.firstName} {e.lastName}</div>
                      <div className="text-[11px] text-slate-500">To: {to}</div>
                      <div className="text-[11px] text-slate-500">Employee Code: {e.employeeCode}</div>
                      {e.jobTitle && <div className="text-[11px] text-slate-500">Role: {e.jobTitle}</div>}
                      <div className="text-[11px] text-slate-500">Date of Joining: {new Date(e.dateOfJoining).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 bg-slate-50 border-t border-slate-100">
                <button type="button" onClick={() => setMailConfirm(null)} disabled={sendWelcomeMailMut.isPending}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  Skip
                </button>
                <button type="button"
                  onClick={() => toast.promise(sendWelcomeMailMut.mutateAsync({ employeeId: e.id }), {
                    loading: "Sending welcome email…",
                    success: "Welcome email sent",
                    error: "Couldn't send the welcome email",
                  })}
                  disabled={sendWelcomeMailMut.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700">
                  <Send size={13} />
                  {sendWelcomeMailMut.isPending ? "Sending..." : "Send Welcome Email"}
                </button>
              </div>
              {sendWelcomeMailMut.isError && (
                <div className="px-6 pb-3 text-xs text-red-600">Mail send failed. Check SMTP config.</div>
              )}
            </div>
          </div>
        );
      })()}
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
