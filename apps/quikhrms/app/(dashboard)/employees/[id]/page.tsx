"use client";

import { Suspense, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Building2,
  Calendar,
  Briefcase,
  User,
  Globe,
  GraduationCap,
  Pencil,
  Shield,
  Camera,
  Loader2,
  Trash2,
  Palmtree,
  Clock,
  CheckSquare,
  FileText,
  ShieldCheck,
  Accessibility,
  Check,
  X as XIcon,
} from "lucide-react";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { withBasePath } from "@/lib/utils/base-path";
import { Select } from "@/components/hrms/ui/select";
import { Modal } from "@/components/hrms/modal";
import { useDialog } from "@/components/hrms/dialog";
import { useToast } from "@/components/hrms/toast";
import { SkeletonLine } from "@/components/hrms/skeleton";

interface EmployeeDetail {
  id: string;
  employeeCode: string;
  // Account-lockout state (3 failed logins → 1h freeze).
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
  emergencyContacts: Array<{
    name: string;
    relationship: string;
    phone: string;
  }> | null;
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
  educations: Array<{
    degree: string;
    institution: string;
    fieldOfStudy?: string;
    startYear: number;
    endYear?: number;
    grade?: string;
  }> | null;
  languages: Array<{ language: string; proficiency: string }> | null;
  department: { id: string; name: string; code: string } | null;
  team: { id: string; name: string } | null;
  designation: { id: string; title: string; level: number } | null;
  grade: { id: string; name: string; level: number } | null;
  // Statutory flags — surface in profile so admins/Finance see who's excluded.
  isHandicapped?: boolean;
  epfApplicable?: boolean;
  esiApplicable?: boolean;
  ptApplicable?: boolean;
  officeLocation: {
    id: string;
    name: string;
    city: string;
    country: string;
  } | null;
  reportingManager: {
    id: string;
    firstName: string;
    lastName: string;
    profilePhoto: string | null;
    jobTitle: string | null;
    employeeCode: string;
  } | null;
  directReports?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    profilePhoto: string | null;
    jobTitle: string | null;
    employeeCode: string;
  }>;
  role: {
    id: string;
    code: string;
    name: string;
    description: string | null;
  } | null;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <h3 className="flex items-center gap-2 text-[13px] font-semibold text-gray-900 mb-4">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-xs text-gray-900">{value || "—"}</dd>
    </div>
  );
}

interface RoleLite { id: string; code: string; name: string; priority: number; isSystem: boolean; }

export default function EmployeeProfilePage() {
  return (
    <Suspense fallback={<div className="p-4 space-y-2"><SkeletonLine w="40%" h={16} /><SkeletonLine w="70%" h={12} /><SkeletonLine w="60%" h={12} /></div>}>
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

  const { data, isLoading, error } = useQuery({
    queryKey: ["employee", id],
    queryFn: () => api.get<EmployeeDetail>(`/api/v1/hrms/employees/${id}`),
    retry: false,
    // Page renders its own inline error card, so skip the global error toast.
    meta: { suppressGlobalError: true },
  });

  const { data: meData } = useQuery({
    queryKey: ["employee", "me"],
    queryFn: () => api.get<{ id: string }>("/api/v1/hrms/employees/me"),
    staleTime: 60_000,
  });
  const isSelf = meData?.data?.id === id;
  const canEditProfile = isSelf || hasPermission("hrms.employee.write");

  // "Back to Directory" only makes sense for users who can actually open the
  // People directory. A self-service employee reaching their own profile via
  // "My Profile" has no directory to go back to — send them to the dashboard
  // (and honour an explicit ?returnTo when present).
  const canViewDirectory =
    hasPermission("hrms.employee.read") ||
    hasPermission("hrms.employee.read_team") ||
    hasPermission("hrms.org.read");
  const backNav = returnTo
    ? { href: returnTo, label: "Back" }
    : canViewDirectory
      ? { href: "/org-chart", label: "Back to Directory" }
      : { href: "/dashboard", label: "Back to Dashboard" };

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

  // Admin unlock for accounts frozen by repeated failed logins.
  const unlockMut = useMutation({
    mutationFn: () => api.post(`/api/v1/hrms/employees/${id}/unlock`, {}),
    onSuccess: () => {
      toast.success("Account unlocked", "They can log in again now.");
      qc.invalidateQueries({ queryKey: ["employee", id] });
    },
  });

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [coverMenuOpen, setCoverMenuOpen] = useState(false);

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

  const coverInputRef = useRef<HTMLInputElement>(null);

  const coverUploadMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.upload<{ url: string }>("/api/v1/hrms/uploads", fd);
      await api.patch(`/api/v1/hrms/employees/${id}`, { coverImage: res.data.url });
      return res;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee", id] }),
  });

  const removeCoverMut = useMutation({
    mutationFn: () => api.patch(`/api/v1/hrms/employees/${id}`, { coverImage: null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee", id] }),
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
    const backHref = backNav.href;
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center mb-5 ${
            isForbidden ? "bg-amber-50 text-amber-500" : "bg-gray-100 text-gray-400"
          }`}
        >
          {isForbidden ? <Shield size={28} /> : <User size={28} />}
        </div>
        <h2 className="text-lg font-semibold text-gray-900">
          {isForbidden ? "Access restricted" : "Employee not found"}
        </h2>
        <p className="text-sm text-gray-500 mt-1.5 max-w-sm">
          {isForbidden
            ? "You don't have permission to view this employee's profile. If you think this is a mistake, contact your HR administrator."
            : "This employee doesn't exist or may have been removed."}
        </p>
        <Link
          href={backHref}
          className="mt-4 inline-flex items-center gap-1.5 btn btn-primary"
        >
          <ArrowLeft size={14} /> Back
        </Link>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    Active: "bg-green-100 text-green-700",
    PreBoarding: "bg-[#dcfce7] text-[#16a34a]",
    OnLeave: "bg-yellow-100 text-yellow-700",
    OnNotice: "bg-orange-100 text-orange-700",
    Suspended: "bg-red-100 text-red-700",
    Relieved: "bg-gray-100 text-gray-600",
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          // Prefer real "go back" to the previous page. Fall back to the
          // computed href only when there's no in-app history to return to
          // (e.g. the profile was opened via a direct link).
          if (returnTo) router.push(returnTo);
          else if (window.history.length > 1) router.back();
          else router.push(backNav.href);
        }}
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 mb-4"
      >
        <ArrowLeft size={14} />
        Back
      </button>

      {/* HiBob-style Cover + Profile Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-4">
        <div
          className="h-28 bg-gradient-to-br from-[#dcfce7] via-[#bbf7d0] to-[#86efac] relative bg-cover bg-center"
          style={emp.coverImage ? { backgroundImage: `url(${emp.coverImage})` } : undefined}
        >
          <input
            ref={coverInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (f.size > 10 * 1024 * 1024) return toast.error("File too large", "Max file size is 10MB");
                coverUploadMut.mutate(f);
              }
              e.target.value = "";
            }}
          />
          {canEditProfile && (
            <div className="absolute top-3 right-3">
              <button
                type="button"
                onClick={() => {
                  if (coverUploadMut.isPending) return;
                  if (!emp.coverImage) coverInputRef.current?.click();
                  else setCoverMenuOpen((o) => !o);
                }}
                disabled={coverUploadMut.isPending}
                className="w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow-sm border border-white/50 flex items-center justify-center text-gray-700 disabled:opacity-60"
                title={emp.coverImage ? "Cover options" : "Add cover image"}
              >
                {coverUploadMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
              </button>
              {coverMenuOpen && emp.coverImage && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setCoverMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 z-20 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => { setCoverMenuOpen(false); coverInputRef.current?.click(); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <Camera size={12} /> Change cover
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setCoverMenuOpen(false);
                        const ok = await dialog.confirm({
                          title: "Remove cover image?",
                          description: "The current cover image will be removed from this profile.",
                          variant: "danger",
                          confirmLabel: "Remove",
                        });
                        if (ok) removeCoverMut.mutate();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 border-t border-gray-100"
                    >
                      <Trash2 size={12} /> Remove cover
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <div className="px-5 pb-5">
          <div className="flex items-end justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
            <div className="relative group flex-shrink-0 -mt-12">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 5 * 1024 * 1024) return setPhotoErr("Max 5MB");
                    photoUploadMut.mutate(f);
                  }
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => { if (canEditProfile) photoInputRef.current?.click(); }}
                disabled={!canEditProfile}
                className="w-24 h-24 rounded-full bg-white ring-4 ring-white shadow-md overflow-hidden flex items-center justify-center relative disabled:cursor-default"
                title={canEditProfile ? "Change profile photo" : emp.firstName}
              >
                {emp.profilePhoto ? (
                  <img src={withBasePath(emp.profilePhoto)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#dcfce7] to-[#86efac] flex items-center justify-center">
                    <User size={36} className="text-[#16a34a]" />
                  </div>
                )}
                {canEditProfile && (
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition">
                    {photoUploadMut.isPending ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
                  </div>
                )}
              </button>
              {canEditProfile && emp.profilePhoto && !photoUploadMut.isPending && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await dialog.confirm({
                      title: "Remove profile photo?",
                      description: "The current profile photo will be removed.",
                      variant: "danger",
                      confirmLabel: "Remove",
                    });
                    if (ok) removePhotoMut.mutate();
                  }}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white text-red-600 shadow-md border border-gray-200 hover:bg-red-50 flex items-center justify-center"
                  title="Remove photo"
                >
                  <Trash2 size={12} />
                </button>
              )}
              {photoErr && (
                <p className="absolute top-full left-0 mt-1 text-[10px] text-red-600 bg-red-50 border border-red-100 rounded px-1.5 py-0.5 whitespace-nowrap">
                  {photoErr}
                </p>
              )}
            </div>
            <div className="min-w-0 pt-1">
              <div className="flex items-center gap-3">
                <h1 className="text-base font-semibold text-gray-900 truncate">
                  {[emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(" ").trim()
                    || emp.displayName
                    || emp.workEmail
                    || emp.employeeCode}
                </h1>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${statusColors[emp.status] ?? "bg-gray-100 text-gray-600"}`}>
                  {emp.status}
                </span>
              </div>
              <p className="text-gray-600 mt-0.5 text-xs">
                {emp.designation?.title ?? emp.jobTitle ?? "No designation"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {emp.department?.name ?? "—"} &middot; {emp.workLocation} &middot; {emp.employeeCode}
              </p>
              {emp.workEmail && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">{emp.workEmail}</p>
              )}
            </div>
            </div>
            {canEditProfile ? (
              <div className="flex items-center gap-2 self-end">
                <Link
                  href={returnTo ? `/employees/${emp.id}/edit?returnTo=${encodeURIComponent(returnTo)}` : `/employees/${emp.id}/edit`}
                  className="flex items-center gap-1.5 btn btn-primary"
                >
                  <Pencil size={13} /> Edit
                </Link>
              </div>
            ) : (
              <span
                className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 border border-gray-200 px-3 py-2 rounded-lg self-end"
                title="Only the profile owner or admins can edit this profile"
              >
                <Shield size={12} /> View only
              </span>
            )}
          </div>

          {/* Icon tab rail (HiBob-style) */}
          <div className="flex items-center gap-5 mt-5 pt-4 border-t border-gray-100">
            {[
              { label: "Time off", icon: Palmtree, href: `/leaves/my-leaves?employeeId=${emp.id}` },
              { label: "Attendance", icon: Clock, href: `/attendance?employeeId=${emp.id}` },
              { label: "Tasks", icon: CheckSquare, href: "/tasks" },
              { label: "Docs", icon: FileText, href: "/documents/my-vault" },
            ].map((t) => (
              <Link
                key={t.label}
                href={t.href}
                className="group flex flex-col items-center gap-1 text-xs font-medium text-gray-600 hover:text-[#22c55e] transition"
              >
                <span className="w-10 h-10 rounded-lg bg-gray-50 group-hover:bg-[#dcfce7] flex items-center justify-center text-gray-500 group-hover:text-[#22c55e] transition">
                  <t.icon size={18} strokeWidth={1.75} />
                </span>
                {t.label}
              </Link>
            ))}
          </div>

          {emp.bio && (
            <p className="text-xs text-gray-600 mt-4 italic">{emp.bio}</p>
          )}
        </div>
      </div>

      {/* Grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Contact */}
        <Section title="Contact Information" icon={<Mail size={16} />}>
          <dl className="grid grid-cols-2 gap-4">
            <InfoRow label="Work Email" value={emp.workEmail} />
            <InfoRow label="Personal Email" value={emp.personalEmail} />
            <InfoRow label="Work Phone" value={emp.workPhone} />
            <InfoRow label="Personal Phone" value={emp.personalPhone} />
          </dl>
          {(emp.linkedinUrl || emp.githubUrl || emp.portfolioUrl) && (
            <div className="mt-4 flex gap-3">
              {emp.linkedinUrl && (
                <a
                  href={emp.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#22c55e] text-xs hover:underline"
                >
                  LinkedIn
                </a>
              )}
              {emp.githubUrl && (
                <a
                  href={emp.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#22c55e] text-xs hover:underline"
                >
                  GitHub
                </a>
              )}
              {emp.portfolioUrl && (
                <a
                  href={emp.portfolioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#22c55e] text-xs hover:underline"
                >
                  Portfolio
                </a>
              )}
            </div>
          )}
        </Section>

        {/* Professional */}
        <Section title="Professional Details" icon={<Briefcase size={16} />}>
          <dl className="grid grid-cols-2 gap-4">
            <InfoRow label="Designation" value={emp.designation?.title} />
            <InfoRow label="Department" value={emp.department?.name} />
            <InfoRow label="Team" value={emp.team?.name} />
            <InfoRow label="Grade" value={emp.grade?.name} />
            <InfoRow label="Employment Type" value={emp.employmentType} />
            <InfoRow label="Worker Type" value={emp.workerType} />
            <InfoRow label="Work Location" value={emp.workLocation} />
            <InfoRow
              label="Office"
              value={
                emp.officeLocation
                  ? [emp.officeLocation.name, emp.officeLocation.city]
                      .filter(Boolean)
                      .join(", ")
                  : null
              }
            />
            <InfoRow label="Source of Hire" value={emp.sourceOfHire} />
            <InfoRow
              label="Notice Period"
              value={`${emp.noticePeriodDays} days`}
            />
          </dl>
        </Section>

        {/* Dates */}
        <Section title="Key Dates" icon={<Calendar size={16} />}>
          <dl className="grid grid-cols-2 gap-4">
            <InfoRow label="Date of Joining" value={formatDate(emp.dateOfJoining)} />
            <InfoRow label="Date of Birth" value={formatDate(emp.dateOfBirth)} />
            <InfoRow label="Confirmation Date" value={formatDate(emp.confirmationDate)} />
            <InfoRow label="Probation End" value={formatDate(emp.probationEndDate)} />
          </dl>
        </Section>

        {/* Personal */}
        <Section title="Personal Information" icon={<User size={16} />}>
          <dl className="grid grid-cols-2 gap-4">
            <InfoRow label="Gender" value={emp.gender} />
            <InfoRow label="Marital Status" value={emp.maritalStatus} />
            <InfoRow label="Blood Group" value={emp.bloodGroup} />
            <InfoRow label="Nationality" value={emp.nationality} />
          </dl>
        </Section>

        {/* Statutory profile — shows PF/ESI/PT applicability + handicapped status.
            Default state (everything applies, not handicapped) is rendered as a
            single neutral pill to keep the section quiet for the common case. */}
        <Section title="Statutory Profile" icon={<ShieldCheck size={16} />}>
          <StatutoryBadges
            isHandicapped={!!emp.isHandicapped}
            epfApplicable={emp.epfApplicable !== false}
            esiApplicable={emp.esiApplicable !== false}
            ptApplicable={emp.ptApplicable !== false}
          />
        </Section>

        {/* Reporting */}
        <Section title="Reporting Structure" icon={<Building2 size={16} />}>
          {emp.reportingManager ? (
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-1">Reports to</p>
              <Link
                href={`/employees/${emp.reportingManager.id}`}
                className="flex items-center gap-2 text-[#22c55e] hover:underline text-xs"
              >
                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                  <User size={12} className="text-gray-500" />
                </div>
                {emp.reportingManager.firstName}{" "}
                {emp.reportingManager.lastName} ({emp.reportingManager.employeeCode})
              </Link>
            </div>
          ) : (
            <p className="text-xs text-gray-500 mb-4">No reporting manager</p>
          )}

          {(emp.directReports?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">
                Direct Reports ({emp.directReports?.length ?? 0})
              </p>
              <div className="space-y-1">
                {(emp.directReports ?? []).map((dr) => (
                  <Link
                    key={dr.id}
                    href={`/employees/${dr.id}`}
                    className="flex items-center gap-2 text-xs text-[#22c55e] hover:underline"
                  >
                    <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center">
                      <User size={10} className="text-gray-500" />
                    </div>
                    {dr.firstName} {dr.lastName}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Role & Permissions */}
        <Section title="Role & Access" icon={<Shield size={16} />}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              {emp.role ? (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#dcfce7] text-[#16a34a]">
                      {emp.role.name}
                    </span>
                    <code className="text-xs text-gray-400 bg-gray-100 px-1 rounded">{emp.role.code}</code>
                  </div>
                  {emp.role.description && (
                    <p className="text-xs text-gray-500 mt-1">{emp.role.description}</p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400">No role assigned</p>
              )}
            </div>
            {canManageRbac && (
              <div className="flex items-center gap-2">
                <Select
                  value={emp.role?.id ?? ""}
                  onChange={(v) => assignRoleMut.mutate(v || null)}
                  disabled={assignRoleMut.isPending}
                  placeholder="— No Role —"
                  searchable
                  options={[
                    { value: "", label: "— No Role —" },
                    ...rolesList.map((r) => ({ value: r.id, label: r.name })),
                  ]}
                  className="w-48"
                />
                {emp.role && (
                  <button
                    onClick={async () => {
                      const ok = await dialog.confirm({
                        title: "Remove role assignment?",
                        description: "This employee will lose role-based permissions until reassigned.",
                        variant: "danger",
                        confirmLabel: "Remove",
                      });
                      if (ok) assignRoleMut.mutate(null);
                    }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          {canManageRbac && emp.lockedUntil && new Date(emp.lockedUntil).getTime() > Date.now() && (
            <div className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold text-red-700">Account locked</p>
                <p className="text-xs text-red-600">
                  Too many failed sign-in attempts. Lifts at{" "}
                  <strong>{new Date(emp.lockedUntil).toLocaleString()}</strong>.
                </p>
              </div>
              <button
                onClick={async () => {
                  const ok = await dialog.confirm({
                    title: "Unlock this account?",
                    description: "The employee will be able to sign in immediately and their failed-attempt counter will reset.",
                    confirmLabel: "Unlock",
                  });
                  if (ok) unlockMut.mutate();
                }}
                disabled={unlockMut.isPending}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {unlockMut.isPending ? "Unlocking…" : "Unlock"}
              </button>
            </div>
          )}
        </Section>

        {/* Education */}
        {emp.educations && emp.educations.length > 0 && (
          <Section title="Education" icon={<GraduationCap size={16} />}>
            <div className="space-y-3">
              {emp.educations.map((edu, i) => (
                <div key={i} className="border-l-2 border-[#bbf7d0] pl-3">
                  <p className="font-medium text-xs text-gray-900">
                    {edu.degree}
                    {edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ""}
                  </p>
                  <p className="text-xs text-gray-600">{edu.institution}</p>
                  <p className="text-xs text-gray-400">
                    {edu.startYear}–{edu.endYear ?? "Present"}
                    {edu.grade ? ` · ${edu.grade}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Skills */}
        {emp.skills && emp.skills.length > 0 && (
          <Section title="Skills" icon={<Globe size={16} />}>
            <div className="flex flex-wrap gap-2">
              {emp.skills.map((skill, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 bg-[#dcfce7] text-[#16a34a] px-2.5 py-1 rounded-full text-xs"
                >
                  {skill.name}
                  <span className="text-[#86efac] text-[10px]">
                    {skill.proficiency}
                  </span>
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Emergency Contacts */}
        {emp.emergencyContacts && emp.emergencyContacts.length > 0 && (
          <Section title="Emergency Contacts" icon={<Phone size={16} />}>
            <div className="space-y-2">
              {emp.emergencyContacts.map((ec, i) => (
                <div key={i} className="text-xs">
                  <p className="font-medium text-gray-900">
                    {ec.name}{" "}
                    <span className="text-gray-400 font-normal">
                      ({ec.relationship})
                    </span>
                  </p>
                  <p className="text-gray-600">{ec.phone}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Address */}
        {emp.currentAddress && (
          <Section title="Address" icon={<MapPin size={16} />}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 mb-1">Current Address</p>
                <p className="text-xs text-gray-900">
                  {emp.currentAddress.line1}
                  {emp.currentAddress.line2 && `, ${emp.currentAddress.line2}`}
                  <br />
                  {emp.currentAddress.city}, {emp.currentAddress.state}{" "}
                  {emp.currentAddress.zipCode}
                  <br />
                  {emp.currentAddress.country}
                </p>
              </div>
              {emp.permanentAddress && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Permanent Address</p>
                  <p className="text-xs text-gray-900">
                    {emp.permanentAddress.line1}
                    {emp.permanentAddress.line2 &&
                      `, ${emp.permanentAddress.line2}`}
                    <br />
                    {emp.permanentAddress.city}, {emp.permanentAddress.state}{" "}
                    {emp.permanentAddress.zipCode}
                    <br />
                    {emp.permanentAddress.country}
                  </p>
                </div>
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function StatutoryBadges({
  isHandicapped, epfApplicable, esiApplicable, ptApplicable,
}: {
  isHandicapped: boolean;
  epfApplicable: boolean;
  esiApplicable: boolean;
  ptApplicable: boolean;
}) {
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

function StatPill({
  label, enabled, kindOn, kindOff, hint,
}: {
  label: string;
  enabled: boolean;
  kindOn: "ok" | "info";
  kindOff: "warn" | "muted";
  hint: string;
}) {
  // Two-axis: enabled+kindOn vs enabled+kindOff
  const cls = enabled
    ? kindOn === "ok"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
      : "bg-green-50 text-green-700 ring-green-100"
    : kindOff === "warn"
      ? "bg-amber-50 text-amber-800 ring-amber-200"
      : "bg-gray-100 text-gray-600 ring-gray-200";
  return (
    <span
      title={hint}
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md ring-1 text-[11px] font-medium ${cls}`}
    >
      {enabled ? <Check size={11} /> : <XIcon size={11} />}
      {label}
      <span className="font-normal opacity-70">{enabled ? "applies" : "excluded"}</span>
    </span>
  );
}
