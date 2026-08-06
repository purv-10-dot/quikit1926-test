"use client";

import { Suspense, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Mail, Phone, MapPin, Building2, Calendar, Briefcase, User, Globe,
  GraduationCap, Pencil, Shield, Camera, Loader2, Trash2, FileText, ShieldCheck,
  Check, X as XIcon, ChevronRight, Palmtree, Wallet, Users, Zap,
  Clock, IdCard, CalendarDays, Send,
} from "lucide-react";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { withBasePath } from "@/lib/utils/base-path";
import { Select } from "@/components/hrms/ui/select";
import { useDialog } from "@/components/hrms/dialog";
import { useToast } from "@/components/hrms/toast";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";
import { TabSwitcher } from "@/components/hrms/tab-switcher";
import { clsx } from "clsx";

interface EmployeeDetail {
  id: string;
  employeeCode: string;
  lockedUntil: string | null;
  failedLoginAttempts: number;
  firstName: string;
  middleName: string | null;
  lastName: string;
  displayName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  profilePhoto: string | null;
  coverImage: string | null;
  bio: string | null;
  personalEmail: string | null;
  workEmail: string;
  personalPhone: string | null;
  workPhone: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  currentAddress: Record<string, string> | null;
  permanentAddress: Record<string, string> | null;
  emergencyContacts: Array<{ name: string; relationship: string; phone: string }> | null;
  jobTitle: string | null;
  employmentType: string;
  workerType: string;
  workLocation: string;
  dateOfJoining: string;
  confirmationDate: string | null;
  probationEndDate: string | null;
  noticePeriodDays: number;
  previousExperience: number;
  sourceOfHire: string | null;
  status: string;
  skills: Array<{ name: string; proficiency: string }> | null;
  educations: Array<{ degree: string; institution: string; fieldOfStudy?: string; startYear: number; endYear?: number; grade?: string }> | null;
  languages: Array<{ language: string; proficiency: string }> | null;
  department: { id: string; name: string; code: string } | null;
  team: { id: string; name: string } | null;
  designation: { id: string; title: string; level: number } | null;
  grade: { id: string; name: string; level: number } | null;
  isHandicapped?: boolean;
  epfApplicable?: boolean;
  esiApplicable?: boolean;
  ptApplicable?: boolean;
  officeLocation: { id: string; name: string; city: string; country: string } | null;
  reportingManager: { id: string; firstName: string; lastName: string; profilePhoto: string | null; jobTitle: string | null; employeeCode: string } | null;
  directReports?: Array<{ id: string; firstName: string; lastName: string; profilePhoto: string | null; jobTitle: string | null; employeeCode: string }>;
  role: { id: string; code: string; name: string; description: string | null } | null;
}

interface EmpDoc { id: string; title: string; category: string; fileUrl: string; fileType: string; createdAt: string; }
interface HistoryItem { id: string; changeType?: string; title?: string; description?: string; effectiveDate?: string; createdAt?: string; }
interface RoleLite { id: string; code: string; name: string; priority: number; isSystem: boolean; }

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_BADGE: Record<string, string> = {
  Active: "bg-green-100 text-green-700",
  PreBoarding: "bg-emerald-50 text-emerald-700",
  OnLeave: "bg-yellow-100 text-yellow-700",
  OnNotice: "bg-orange-100 text-orange-700",
  Suspended: "bg-red-100 text-red-700",
  Relieved: "bg-gray-100 text-gray-600",
};

const TABS = ["overview", "documents", "leave", "attendance", "payroll", "performance", "timeline", "history"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview", documents: "Documents", leave: "Leave", attendance: "Attendance",
  payroll: "Payroll", performance: "Performance", timeline: "Timeline", history: "History",
};

export default function EmployeeProfilePage() {
  return (
    <Suspense fallback={<div className="p-4 space-y-2"><SkeletonLine w="40%" h={16} /><SkeletonLine w="70%" h={12} /><SkeletonLine w="60%" h={12} /></div>}>
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <EmployeeProfilePageInner />
    </Suspense>
  );
}

function EmployeeProfilePageInner() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const api = useApiClient();
  const qc = useQueryClient();
  const { hasPermission } = useDashboardConfig();
  const canManageRbac = hasPermission("hrms.rbac.manage");
  const dialog = useDialog();
  const toast = useToast();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("overview");

  const { data, isLoading, error } = useQuery({
    queryKey: ["employee", id],
    queryFn: () => api.get<EmployeeDetail>(`/api/v1/hrms/employees/${id}`),
    retry: false,
    meta: { suppressGlobalError: true },
  });

  const { data: meData } = useQuery({
    queryKey: ["employee", "me"],
    queryFn: () => api.get<{ id: string }>("/api/v1/hrms/employees/me"),
    staleTime: 60_000,
  });
  const isSelf = meData?.data?.id === id;
  const canEditProfile = isSelf || hasPermission("hrms.employee.write");

  const canViewDirectory =
    hasPermission("hrms.employee.read") ||
    hasPermission("hrms.employee.read_team") ||
    hasPermission("hrms.org.read");

  // Tab visibility mirrors what each tab's data actually requires — a viewer
  // without the underlying permission shouldn't see a tab that would just
  // 403 (or, worse, silently render nothing). `_self` grants only count when
  // viewing your own profile; `all`/`team` grants count regardless.
  const canSeeTab: Record<Tab, boolean> = {
    overview: true, // whole page already 403s via the employee-detail fetch if disallowed
    documents: hasPermission("hrms.document.read") || hasPermission("hrms.document.read_team") || (isSelf && hasPermission("hrms.document.read_self")),
    leave: hasPermission("hrms.leave.read") || hasPermission("hrms.leave.read_team") || (isSelf && hasPermission("hrms.leave.read_self")),
    attendance: hasPermission("hrms.attendance.read") || hasPermission("hrms.attendance.read_team") || (isSelf && hasPermission("hrms.attendance.read_self")),
    // Matches sidebar.tsx's Payroll group: no dedicated payroll permission
    // exists, hrms.settings.* gates admin payroll, read_self opens My Payslips.
    payroll: hasPermission("hrms.settings.read") || hasPermission("hrms.settings.write") || (isSelf && hasPermission("hrms.employee.read_self")),
    performance: hasPermission("hrms.performance.read") || hasPermission("hrms.performance.read_team") || (isSelf && hasPermission("hrms.performance.read_self")),
    // The history API requires read/read_team specifically (no read_self path),
    // so isSelf doesn't bypass this one — matches backend exactly.
    timeline: hasPermission("hrms.employee.read") || hasPermission("hrms.employee.read_team"),
    history: hasPermission("hrms.employee.read") || hasPermission("hrms.employee.read_team"),
  };
  const visibleTabs = TABS.filter((t) => canSeeTab[t]);
  const backNav = returnTo
    ? { href: returnTo, label: "Back" }
    : canViewDirectory
      ? { href: "/org-chart", label: "Back to Directory" }
      : { href: "/dashboard", label: "Back to Dashboard" };

  // Stat-strip + activity data (real where an endpoint exists).
  const { data: leaveSummaryResp } = useQuery({
    queryKey: ["employee", id, "leave-summary"],
    queryFn: () =>
      api.get<{ balances: Array<{ leaveType: string; code: string; isPaid: boolean; available: number }> }>(`/api/v1/hrms/employees/${id}/leave-summary`)
        .catch(() => ({ data: { balances: [] } })),
    staleTime: 60_000,
  });
  const leaveBalances = leaveSummaryResp?.data?.balances ?? [];
  const leaveTotal = leaveBalances.reduce((s, b) => s + (Number(b.available) || 0), 0);

  const { data: docsResp } = useQuery({
    queryKey: ["employee-documents", id],
    queryFn: () => api.get<EmpDoc[]>(`/api/v1/hrms/documents?employeeId=${id}&limit=100`).catch(() => ({ data: [] as EmpDoc[] })),
  });
  const docCount = docsResp?.data?.length ?? 0;

  const { data: historyResp } = useQuery({
    queryKey: ["employee", id, "history"],
    queryFn: () => api.get<HistoryItem[]>(`/api/v1/hrms/employees/${id}/history`).catch(() => ({ data: [] as HistoryItem[] })),
    staleTime: 60_000,
  });
  const history = historyResp?.data ?? [];

  const { data: rolesResp } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<RoleLite[]>("/api/v1/hrms/settings/roles"),
    enabled: canManageRbac,
  });
  const rolesList = rolesResp?.data ?? [];

  const assignRoleMut = useMutation({
    mutationFn: (roleId: string | null) => api.put(`/api/v1/hrms/employees/${id}/role`, { roleId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee", id] }),
  });

  const unlockMut = useMutation({
    mutationFn: () => api.post(`/api/v1/hrms/employees/${id}/unlock`, {}),
    onSuccess: () => {
      toast.success("Account unlocked", "They can log in again now.");
      qc.invalidateQueries({ queryKey: ["employee", id] });
    },
  });

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  const photoUploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.upload<{ url: string }>("/api/v1/hrms/uploads", fd);
      await api.patch(`/api/v1/hrms/employees/${id}`, { profilePhoto: res.data.url });
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee", id] });
      qc.invalidateQueries({ queryKey: ["me", "sidebar"] });
      setPhotoErr(null);
    },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setPhotoErr(e.message),
  });

  const removePhotoMut = useMutation({
    mutationFn: () => api.patch(`/api/v1/hrms/employees/${id}`, { profilePhoto: null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee", id] });
      qc.invalidateQueries({ queryKey: ["me", "sidebar"] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        <SkeletonLine w="30%" h={16} />
        <SkeletonLine w="70%" h={12} />
        <SkeletonLine w="60%" h={12} />
        <SkeletonLine w="50%" h={12} />
      </div>
    );
  }

  const emp = data?.data;
  if (!emp) {
    const status = (error as { status?: number } | null)?.status;
    const isForbidden = status === 403;
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-5 ${isForbidden ? "bg-amber-50 text-amber-500" : "bg-gray-100 text-gray-400"}`}>
          {isForbidden ? <Shield size={28} /> : <User size={28} />}
        </div>
        <h2 className="text-lg font-semibold text-gray-900">{isForbidden ? "Access restricted" : "Employee not found"}</h2>
        <p className="text-sm text-gray-500 mt-1.5 max-w-sm">
          {isForbidden
            ? "You don't have permission to view this employee's profile. If you think this is a mistake, contact your HR administrator."
            : "This employee doesn't exist or may have been removed."}
        </p>
        <Link href={backNav.href} className="mt-4 inline-flex items-center gap-1.5 btn btn-primary"><ArrowLeft size={14} /> Back</Link>
      </div>
    );
  }

  const fullName = [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(" ").trim()
    || emp.displayName || emp.workEmail || emp.employeeCode;
  const inits = `${emp.firstName?.[0] ?? ""}${emp.lastName?.[0] ?? ""}`.toUpperCase() || "?";
  const editHref = returnTo ? `/employees/${emp.id}/edit?returnTo=${encodeURIComponent(returnTo)}` : `/employees/${emp.id}/edit`;

  // Profile completeness — share of key fields that are filled in.
  const checks = [
    !!emp.profilePhoto, !!emp.workEmail, !!emp.personalEmail, !!emp.personalPhone,
    !!emp.dateOfBirth, !!emp.gender, !!emp.bloodGroup, !!emp.maritalStatus, !!emp.nationality,
    !!emp.department, !!emp.designation, !!emp.grade, !!emp.reportingManager,
    !!emp.currentAddress, !!(emp.emergencyContacts?.length), !!(emp.educations?.length),
    !!(emp.languages?.length), !!(emp.skills?.length),
  ];
  const completePct = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  const langs = emp.languages?.map((l) => l.language).filter(Boolean).join(", ") || null;
  const office = emp.officeLocation ? [emp.officeLocation.name, emp.officeLocation.city].filter(Boolean).join(", ") : null;
  const locationLabel = office || emp.workLocation;

  return (
    <div className="w-full pb-8">
      <button type="button" onClick={() => router.push(returnTo ?? backNav.href)}
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 mb-3">
        <ArrowLeft size={14} /> {backNav.label}
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
        <div className="flex items-start gap-5 flex-wrap">
          {/* Avatar */}
          <div className="relative shrink-0 group">
            <input ref={photoInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { if (f.size > 5 * 1024 * 1024) return setPhotoErr("Max 5MB"); photoUploadMut.mutate(f); }
                e.target.value = "";
              }} />
            <button type="button" onClick={() => { if (canEditProfile) photoInputRef.current?.click(); }} disabled={!canEditProfile}
              className="w-24 h-24 rounded-full ring-4 ring-white shadow-md overflow-hidden grid place-items-center relative bg-green-50 disabled:cursor-default"
              title={canEditProfile ? "Change profile photo" : fullName}>
              {emp.profilePhoto
                ? <img src={withBasePath(emp.profilePhoto)} alt="" className="w-full h-full object-cover" />
                : <span className="text-2xl font-bold text-green-600">{inits}</span>}
              {canEditProfile && (
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 grid place-items-center text-white transition">
                  {photoUploadMut.isPending ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                </div>
              )}
            </button>
            <span className={clsx("absolute bottom-1.5 right-1.5 w-4 h-4 rounded-full ring-2 ring-white",
              emp.status === "Active" ? "bg-green-500" : "bg-gray-300")} title={emp.status} />
            {photoErr && <p className="absolute top-full left-0 mt-1 text-[10px] text-red-600 whitespace-nowrap">{photoErr}</p>}
          </div>

          {/* Identity + contact */}
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{fullName}</h1>
              <span className={clsx("px-2.5 py-0.5 rounded-full text-[11px] font-semibold", STATUS_BADGE[emp.status] ?? "bg-gray-100 text-gray-600")}>{emp.status}</span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{emp.designation?.title ?? emp.jobTitle ?? "No designation"}</p>
            <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2 text-[12px] text-gray-500">
              <span className="inline-flex items-center gap-1"><IdCard size={13} className="text-gray-400" />{emp.employeeCode}</span>
              <span className="inline-flex items-center gap-1"><Building2 size={13} className="text-gray-400" />{emp.department?.name ?? "—"}</span>
              <span className="inline-flex items-center gap-1"><Briefcase size={13} className="text-gray-400" />{emp.employmentType}</span>
              <span className="inline-flex items-center gap-1"><MapPin size={13} className="text-gray-400" />{locationLabel}</span>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <ContactItem icon={<Mail size={15} className="text-green-600" />} value={emp.workEmail} label="Work Email" />
              <ContactItem icon={<Phone size={15} className="text-green-600" />} value={emp.personalPhone || emp.workPhone || "—"} label="Phone" />
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-8 h-8 rounded-full bg-green-50 grid place-items-center shrink-0 overflow-hidden">
                  {emp.reportingManager?.profilePhoto
                    ? <img src={withBasePath(emp.reportingManager.profilePhoto)} alt="" className="w-full h-full object-cover" />
                    : <User size={14} className="text-green-600" />}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-gray-900 truncate">
                    {emp.reportingManager ? `${emp.reportingManager.firstName} ${emp.reportingManager.lastName}` : "—"}
                  </div>
                  <div className="text-[11px] text-gray-400">Reporting Manager</div>
                </div>
              </div>
              <ContactItem icon={<Calendar size={15} className="text-green-600" />} value={formatDate(emp.dateOfJoining)} label="Date of Joining" />
            </div>
          </div>

          {/* Completeness + actions */}
          <div className="flex items-start gap-4 shrink-0">
            <div className="hidden md:flex flex-col items-center">
              <CompletenessRing pct={completePct} />
              <div className="text-[11px] text-gray-500 mt-1">Profile Complete</div>
              <button type="button" onClick={() => setTab("overview")} className="text-[11px] font-medium text-green-700 hover:underline">View Details</button>
            </div>
            <div className="flex items-center gap-2">
              {canEditProfile ? (
                <Link href={editHref} className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3.5 py-2 rounded-lg text-[13px] font-semibold shadow-sm transition">
                  <Pencil size={14} /> Edit Profile
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 border border-gray-200 px-3 py-2 rounded-lg" title="Only the profile owner or admins can edit">
                  <Shield size={12} /> View only
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <StatCard icon={Palmtree}   tile="bg-green-100 text-green-600"   value={String(leaveTotal)} label="Leave Balance" sub="Days" />
        <StatCard icon={Clock}      tile="bg-blue-100 text-blue-600"     value="—"                  label="Attendance"    sub="This Month" />
        <StatCard icon={CalendarDays} tile="bg-amber-100 text-amber-600" value="—"                  label="Pending Tasks" sub="Assigned" />
        <StatCard icon={FileText}   tile="bg-indigo-100 text-indigo-600" value={String(docCount)}   label="Documents"     sub="Uploaded" />
        <StatCard icon={Zap}        tile="bg-purple-100 text-purple-600" value="—"                  label="Performance"   sub="Last Cycle" />
      </div>

      {/* Tabs */}
      <TabSwitcher
        className="mb-4"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        tabs={visibleTabs.map((t) => ({ value: t, label: TAB_LABEL[t] }))}
      />

      {/* Content */}
      {tab === "overview" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <DetailCard title="Professional Details" icon={<Briefcase size={16} />}>
              <FieldGrid>
                <Field label="Department" value={emp.department?.name} />
                <Field label="Designation" value={emp.designation?.title ?? emp.jobTitle} />
                <Field label="Employment Type" value={emp.employmentType} />
                <Field label="Grade" value={emp.grade?.name} />
                <Field label="Work Location" value={emp.workLocation} />
                <Field label="Work Location Type" value={emp.workerType} />
                <Field label="Source of Hire" value={emp.sourceOfHire} />
                <Field label="Notice Period" value={`${emp.noticePeriodDays} Days`} />
              </FieldGrid>
            </DetailCard>

            <DetailCard title="Personal Details" icon={<User size={16} />}>
              <FieldGrid>
                <Field label="Date of Birth" value={formatDate(emp.dateOfBirth)} />
                <Field label="Gender" value={emp.gender} />
                <Field label="Marital Status" value={emp.maritalStatus} />
                <Field label="Blood Group" value={emp.bloodGroup} />
                <Field label="Nationality" value={emp.nationality} />
                <Field label="Languages Known" value={langs} />
                <Field label="Team" value={emp.team?.name} />
                <Field label="Confirmation Date" value={formatDate(emp.confirmationDate)} />
              </FieldGrid>
            </DetailCard>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DetailCard title="Contact Information" icon={<Phone size={16} />}>
                <div className="space-y-3">
                  <LineItem icon={<Mail size={14} />} label="Work Email" value={emp.workEmail} />
                  <LineItem icon={<Mail size={14} />} label="Personal Email" value={emp.personalEmail} />
                  <LineItem icon={<Phone size={14} />} label="Work Phone" value={emp.workPhone} />
                  <LineItem icon={<Phone size={14} />} label="Personal Phone" value={emp.personalPhone} />
                  <LineItem icon={<MapPin size={14} />} label="Office Location" value={office} />
                </div>
                {(emp.linkedinUrl || emp.githubUrl || emp.portfolioUrl) && (
                  <div className="mt-3 pt-3 border-t border-gray-100 flex gap-3 text-xs">
                    {emp.linkedinUrl && <a href={emp.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline">LinkedIn</a>}
                    {emp.githubUrl && <a href={emp.githubUrl} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline">GitHub</a>}
                    {emp.portfolioUrl && <a href={emp.portfolioUrl} target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline">Portfolio</a>}
                  </div>
                )}
              </DetailCard>

              <DetailCard title="Statutory Details" icon={<ShieldCheck size={16} />}>
                <StatutoryBadges
                  isHandicapped={!!emp.isHandicapped}
                  epfApplicable={emp.epfApplicable !== false}
                  esiApplicable={emp.esiApplicable !== false}
                  ptApplicable={emp.ptApplicable !== false}
                />
              </DetailCard>
            </div>

            {emp.educations && emp.educations.length > 0 && (
              <DetailCard title="Education" icon={<GraduationCap size={16} />}>
                <div className="space-y-3">
                  {emp.educations.map((edu, i) => (
                    <div key={i} className="border-l-2 border-green-200 pl-3">
                      <p className="text-[13px] font-semibold text-gray-900">{edu.degree}{edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ""}</p>
                      <p className="text-xs text-gray-600">{edu.institution}</p>
                      <p className="text-[11px] text-gray-400">{edu.startYear}–{edu.endYear ?? "Present"}{edu.grade ? ` · ${edu.grade}` : ""}</p>
                    </div>
                  ))}
                </div>
              </DetailCard>
            )}

            {emp.skills && emp.skills.length > 0 && (
              <DetailCard title="Skills" icon={<Globe size={16} />}>
                <div className="flex flex-wrap gap-2">
                  {emp.skills.map((s, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-2.5 py-1 rounded-full text-xs">
                      {s.name}<span className="text-green-500 text-[10px]">{s.proficiency}</span>
                    </span>
                  ))}
                </div>
              </DetailCard>
            )}

            {emp.emergencyContacts && emp.emergencyContacts.length > 0 && (
              <DetailCard title="Emergency Contacts" icon={<Phone size={16} />}>
                <div className="space-y-2">
                  {emp.emergencyContacts.map((ec, i) => (
                    <div key={i} className="text-xs">
                      <p className="font-semibold text-gray-900">{ec.name} <span className="text-gray-400 font-normal">({ec.relationship})</span></p>
                      <p className="text-gray-600">{ec.phone}</p>
                    </div>
                  ))}
                </div>
              </DetailCard>
            )}

            {/* Role & Access (admins) */}
            <DetailCard title="Role & Access" icon={<Shield size={16} />}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  {emp.role ? (
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-50 text-green-700">{emp.role.name}</span>
                        <code className="text-xs text-gray-400 bg-gray-100 px-1 rounded">{emp.role.code}</code>
                      </div>
                      {emp.role.description && <p className="text-xs text-gray-500 mt-1">{emp.role.description}</p>}
                    </div>
                  ) : <p className="text-xs text-gray-400">No role assigned</p>}
                </div>
                {canManageRbac && (
                  <div className="flex items-center gap-2">
                    <Select value={emp.role?.id ?? ""} onChange={(v) => assignRoleMut.mutate(v || null)} disabled={assignRoleMut.isPending}
                      placeholder="— No Role —" searchable
                      options={[{ value: "", label: "— No Role —" }, ...rolesList.map((r) => ({ value: r.id, label: r.name }))]} className="w-48" />
                  </div>
                )}
              </div>
              {canManageRbac && emp.lockedUntil && new Date(emp.lockedUntil).getTime() > Date.now() && (
                <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-semibold text-red-700">Account locked</p>
                    <p className="text-xs text-red-600">Too many failed sign-in attempts. Lifts at <strong>{new Date(emp.lockedUntil).toLocaleString()}</strong>.</p>
                  </div>
                  <button onClick={async () => { const ok = await dialog.confirm({ title: "Unlock this account?", description: "The employee will be able to sign in immediately and their failed-attempt counter will reset.", confirmLabel: "Unlock" }); if (ok) unlockMut.mutate(); }}
                    disabled={unlockMut.isPending}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-50">
                    {unlockMut.isPending ? "Unlocking…" : "Unlock"}
                  </button>
                </div>
              )}
            </DetailCard>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <DetailCard title="Reporting Structure" icon={<Users size={16} />}>
              {emp.reportingManager ? (
                <Link href={`/employees/${emp.reportingManager.id}`} className="flex items-center gap-2.5 rounded-lg border border-gray-200 p-2.5 hover:border-green-200 hover:bg-green-50/40 transition">
                  <span className="w-9 h-9 rounded-full bg-green-50 grid place-items-center overflow-hidden shrink-0">
                    {emp.reportingManager.profilePhoto ? <img src={withBasePath(emp.reportingManager.profilePhoto)} alt="" className="w-full h-full object-cover" /> : <User size={15} className="text-green-600" />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-gray-900 truncate">{emp.reportingManager.firstName} {emp.reportingManager.lastName}</div>
                    <div className="text-[11px] text-gray-400 truncate">{emp.reportingManager.jobTitle ?? "Manager"}</div>
                  </div>
                </Link>
              ) : <p className="text-xs text-gray-400">No reporting manager</p>}

              {(emp.directReports?.length ?? 0) > 0 && (
                <div className="mt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">Reports ({emp.directReports?.length})</p>
                  <div className="space-y-1.5">
                    {(emp.directReports ?? []).map((dr) => (
                      <Link key={dr.id} href={`/employees/${dr.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 transition">
                        <span className="w-7 h-7 rounded-full bg-gray-100 grid place-items-center overflow-hidden shrink-0">
                          {dr.profilePhoto ? <img src={withBasePath(dr.profilePhoto)} alt="" className="w-full h-full object-cover" /> : <User size={12} className="text-gray-400" />}
                        </span>
                        <div className="min-w-0">
                          <div className="text-[12px] font-medium text-gray-800 truncate">{dr.firstName} {dr.lastName}</div>
                          <div className="text-[10px] text-gray-400 truncate">{dr.jobTitle ?? dr.employeeCode}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <Link href="/org-chart" className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 py-2 text-[12px] font-medium text-gray-600 transition">
                <Users size={13} /> View Org Chart
              </Link>
            </DetailCard>

            <DetailCard title="Quick Actions" icon={<Zap size={16} />}>
              <div className="grid grid-cols-2 gap-2">
                <QuickAction icon={Palmtree} label="Apply Leave" href={`/leaves/my-leaves?employeeId=${emp.id}`} />
                <QuickAction icon={Send} label="Request Documents" href={`/documents/employees?employeeId=${emp.id}`} />
                <QuickAction icon={User} label="Update Profile" href={editHref} />
                <QuickAction icon={Wallet} label="View Payslip" href="/payroll/payslips" />
              </div>
            </DetailCard>

            <DetailCard title="Recent Activity" icon={<Clock size={16} />}>
              {history.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">No recent activity.</p>
              ) : (
                <ul className="space-y-2.5">
                  {history.slice(0, 6).map((h) => (
                    <li key={h.id} className="flex items-start gap-2.5">
                      <span className="w-6 h-6 rounded-md bg-green-50 text-green-600 grid place-items-center shrink-0 mt-0.5"><FileText size={12} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] text-gray-800 truncate">{h.changeType || h.title || "Profile updated"}</div>
                        <div className="text-[10px] text-gray-400">{formatDate(h.effectiveDate || h.createdAt)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </DetailCard>
          </div>
        </div>
      ) : tab === "documents" ? (
        <DetailCard title="Documents" icon={<FileText size={16} />}>
          <EmployeeDocuments employeeId={emp.id} />
        </DetailCard>
      ) : tab === "leave" ? (
        <DetailCard title="Leave Balances" icon={<Palmtree size={16} />}>
          {leaveBalances.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No leave balances for this year.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {leaveBalances.map((b) => (
                <div key={b.code} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
                  <div className="text-xl font-bold text-gray-900">{b.available}</div>
                  <div className="text-[11px] text-gray-500 truncate">{b.leaveType}</div>
                  <div className="text-[10px] text-gray-400">{b.isPaid ? "Paid" : "Unpaid"}</div>
                </div>
              ))}
            </div>
          )}
          <Link href={`/leaves/my-leaves?employeeId=${emp.id}`} className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-green-700 hover:underline">
            Go to Leaves <ChevronRight size={14} />
          </Link>
        </DetailCard>
      ) : tab === "timeline" || tab === "history" ? (
        <DetailCard title={tab === "history" ? "Employment History" : "Timeline"} icon={<Clock size={16} />}>
          {history.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No history recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="flex items-start gap-3 border-l-2 border-green-200 pl-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-gray-900">{h.changeType || h.title || "Update"}</div>
                    {h.description && <div className="text-xs text-gray-600">{h.description}</div>}
                    <div className="text-[11px] text-gray-400">{formatDate(h.effectiveDate || h.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DetailCard>
      ) : (
        <ModulePlaceholder tab={tab} employeeId={emp.id} />
      )}
    </div>
  );
}

/* ── Small presentational helpers ─────────────────────────── */

function ContactItem({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-8 h-8 rounded-full bg-green-50 grid place-items-center shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-gray-900 truncate">{value || "—"}</div>
        <div className="text-[11px] text-gray-400">{label}</div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, tile, value, label, sub }: { icon: React.ElementType; tile: string; value: string; label: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-3">
      <span className={clsx("w-11 h-11 rounded-xl grid place-items-center shrink-0", tile)}><Icon size={20} /></span>
      <div className="min-w-0">
        <div className="text-lg font-bold text-gray-900 leading-tight">{value}</div>
        <div className="text-[11px] font-medium text-gray-600 truncate">{label}</div>
        <div className="text-[10px] text-gray-400 truncate">{sub}</div>
      </div>
    </div>
  );
}

function DetailCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="flex items-center gap-2 text-[13px] font-bold text-gray-900 mb-4">
        <span className="text-green-600">{icon}</span>{title}
      </h3>
      {children}
    </div>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5">{children}</dl>;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-[11px] text-gray-400 mb-0.5">{label}</dt>
      <dd className="text-[13px] font-semibold text-gray-900 break-words">{value || "—"}</dd>
    </div>
  );
}

function LineItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-7 h-7 rounded-md bg-gray-50 text-gray-400 grid place-items-center shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] text-gray-400">{label}</div>
        <div className="text-[12px] font-medium text-gray-900 truncate">{value || "—"}</div>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, href }: { icon: React.ElementType; label: string; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-medium text-gray-700 hover:bg-gray-50 hover:border-green-200 transition">
      <Icon size={14} className="text-green-600 shrink-0" /> <span className="truncate">{label}</span>
    </Link>
  );
}

function CompletenessRing({ pct }: { pct: number }) {
  const size = 104, stroke = 8, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#22c55e" strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-xl font-bold text-gray-900">{pct}%</span>
      </div>
    </div>
  );
}

function ModulePlaceholder({ tab, employeeId }: { tab: Tab; employeeId: string }) {
  const map: Record<string, { icon: React.ElementType; title: string; href: string; cta: string }> = {
    attendance: { icon: Clock, title: "Attendance", href: `/attendance?employeeId=${employeeId}`, cta: "Open Attendance" },
    payroll: { icon: Wallet, title: "Payroll", href: "/payroll/payslips", cta: "Open Payroll" },
    performance: { icon: Zap, title: "Performance", href: "/performance", cta: "Open Performance" },
  };
  const m = map[tab] ?? map.attendance;
  const Icon = m.icon;
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
      <span className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 grid place-items-center mx-auto mb-3"><Icon size={22} /></span>
      <p className="text-[13px] font-semibold text-gray-900">{m.title}</p>
      <p className="text-xs text-gray-500 mt-1">Detailed {m.title.toLowerCase()} for this employee lives in its own module.</p>
      <Link href={m.href} className="mt-4 inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3.5 py-2 rounded-lg text-[12px] font-semibold transition">
        {m.cta} <ChevronRight size={14} />
      </Link>
    </div>
  );
}

/* ── Documents + Statutory (kept) ─────────────────────────── */

function EmployeeDocuments({ employeeId }: { employeeId: string }) {
  const api = useApiClient();
  const { data, isLoading } = useQuery({
    queryKey: ["employee-documents", employeeId],
    queryFn: () => api.get<EmpDoc[]>(`/api/v1/hrms/documents?employeeId=${employeeId}&limit=100`).catch(() => ({ data: [] as EmpDoc[] })),
  });
  const docs = data?.data ?? [];
  if (isLoading) return <div className="py-6 text-center text-xs text-gray-400">Loading documents…</div>;
  if (docs.length === 0) return <div className="py-6 text-center text-xs text-gray-400">No documents on file yet.</div>;
  return (
    <ul className="divide-y divide-gray-100">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-3 py-2.5">
          <span className="w-8 h-8 rounded-lg bg-gray-50 text-gray-400 grid place-items-center shrink-0"><FileText size={15} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-gray-900 truncate">{d.title}</div>
            <div className="text-[11px] text-gray-400">{d.category} · {formatDate(d.createdAt)}</div>
          </div>
          <Link href={`/documents/${d.id}`} className="shrink-0 text-[12px] font-semibold text-green-700 hover:underline">View</Link>
        </li>
      ))}
    </ul>
  );
}

function StatutoryBadges({ isHandicapped, epfApplicable, esiApplicable, ptApplicable }: { isHandicapped: boolean; epfApplicable: boolean; esiApplicable: boolean; ptApplicable: boolean }) {
  const allDefault = !isHandicapped && epfApplicable && esiApplicable && ptApplicable;
  if (allDefault) {
    return (
      <p className="text-xs text-gray-500 flex items-center gap-1.5">
        <Check size={12} className="text-emerald-600" />
        Standard statutory profile — all deductions apply, not a PwD.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <StatPill label="PwD" enabled={isHandicapped} kindOn="info" kindOff="muted" hint="Person with Disability — bumps ESI ceiling to ₹25k" />
      <StatPill label="EPF" enabled={epfApplicable} kindOn="ok" kindOff="warn" hint={epfApplicable ? "EPF will be deducted" : "EPF deduction skipped — likely Excluded Employee / contractor / expat"} />
      <StatPill label="ESI" enabled={esiApplicable} kindOn="ok" kindOff="warn" hint={esiApplicable ? "ESI applies (engine still checks ₹21k ceiling)" : "ESI deduction force-skipped for this employee"} />
      <StatPill label="PT"  enabled={ptApplicable}  kindOn="ok" kindOff="warn" hint={ptApplicable ? "Professional Tax applies per office state" : "Professional Tax skipped — expat / state exemption"} />
    </div>
  );
}

function StatPill({ label, enabled, kindOn, kindOff, hint }: { label: string; enabled: boolean; kindOn: "ok" | "info"; kindOff: "warn" | "muted"; hint: string }) {
  const cls = enabled
    ? kindOn === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-green-50 text-green-700 ring-green-100"
    : kindOff === "warn" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-gray-100 text-gray-600 ring-gray-200";
  return (
    <span title={hint} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md ring-1 text-[11px] font-medium ${cls}`}>
      {enabled ? <Check size={11} /> : <XIcon size={11} />}
      {label}
      <span className="font-normal opacity-70">{enabled ? "applies" : "excluded"}</span>
    </span>
  );
}
