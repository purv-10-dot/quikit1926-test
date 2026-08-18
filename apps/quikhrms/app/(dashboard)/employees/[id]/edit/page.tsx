"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDepartments, useDesignations, useLocations } from "@/lib/hooks/use-ref-data";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import {
  X, Pencil, ShieldAlert,
  User, Phone, Briefcase, ShieldCheck, ClipboardCheck,
  Mail, Calendar, MapPin, Building2, IdCard, Save, Check, Banknote,
  ArrowLeft, ArrowRight, Lock,
} from "lucide-react";
import { clsx } from "clsx";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { BankDetailsFields } from "@/components/hrms/bank-details-fields";
import { PageBackground } from "@/components/hrms/page-background";

type EmploymentType = "FullTime" | "PartTime" | "Contract" | "Intern";
type WorkLocation = "Office" | "Remote" | "Hybrid";
type EmployeeStatus = "Active" | "PreBoarding" | "OnLeave" | "OnNotice" | "Suspended" | "Relieved";
type Gender = "Male" | "Female" | "Transgender" | "NonBinary" | "PreferNotToSay";

interface Department { id: string; name: string; }
interface Designation { id: string; title: string; }
interface Location { id: string; name: string; }
interface Employee { id: string; firstName: string; lastName: string; }

type NoticePeriodOption = { id: string; name: string; duration: number; unit: "Days" | "Weeks" | "Months" };
/** Convert a configured notice period to whole days (same math as offboarding). */
const periodToDays = (p: NoticePeriodOption) => p.unit === "Months" ? p.duration * 30 : p.unit === "Weeks" ? p.duration * 7 : p.duration;

interface BankAccount {
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  branchName?: string;
  accountType?: string | null;
  isPrimary?: boolean;
}

type BankAccountType = "Savings" | "Current" | "Salary" | "NRE" | "NRO";

interface EmployeeData {
  id: string; firstName: string; lastName: string; middleName: string | null;
  workEmail: string; personalEmail: string | null;
  personalPhone: string | null; workPhone: string | null;
  gender: Gender | null; dateOfBirth: string | null;
  panNumber: string | null; aadhaarNumber: string | null;
  jobTitle: string | null;
  departmentId: string | null; designationId: string | null; officeLocationId: string | null; reportingManagerId: string | null;
  employmentType: EmploymentType; workLocation: WorkLocation;
  dateOfJoining: string; noticePeriodDays: number | null; noticePeriodId: string | null; previousExperience: number | null;
  status: EmployeeStatus;
  isHandicapped?: boolean;
  // Statutory applicability — defaults to true server-side if absent.
  epfApplicable?: boolean;
  esiApplicable?: boolean;
  ptApplicable?: boolean;
  bankAccounts?: BankAccount[] | null;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankBranch?: string;
  bankAccountType?: BankAccountType | "";
}

const EMP_TYPES: EmploymentType[] = ["FullTime", "PartTime", "Contract", "Intern"];
const WORK_LOCS: WorkLocation[] = ["Office", "Remote", "Hybrid"];

const STEPS = [
  { id: "personal",   num: 1, title: "Personal Details", subtitle: "Basic information",       icon: <User size={16} /> },
  { id: "contact",    num: 2, title: "Contact",          subtitle: "Contact details",         icon: <Phone size={16} /> },
  { id: "employment", num: 3, title: "Employment",       subtitle: "Job & work details",      icon: <Briefcase size={16} /> },
  { id: "identity",   num: 4, title: "Identity",         subtitle: "KYC information",         icon: <ShieldCheck size={16} /> },
  { id: "bank",       num: 5, title: "Bank Details",     subtitle: "Salary credit account",   icon: <Banknote size={16} /> },
  { id: "review",     num: 6, title: "Review",           subtitle: "Review & confirm",        icon: <ClipboardCheck size={16} /> },
] as const;

type StepId = typeof STEPS[number]["id"];

export default function EditEmployeePage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<div className="p-4 space-y-2"><SkeletonLine w="40%" h={16} /><SkeletonLine w="70%" h={12} /><SkeletonLine w="60%" h={12} /></div>}>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <EditEmployeePageInner params={params} />
    </Suspense>
  );
}

function EditEmployeePageInner({ params }: { params: { id: string } }) {
  const { id } = params;
  const api = useApiClient();
  const router = useRouter();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const { data: empRes } = useQuery({
    queryKey: ["employee", id],
    queryFn: () => api.get<EmployeeData>(`/api/v1/hrms/employees/${id}`),
  });

  const { data: meRes, isLoading: meLoading } = useQuery({
    queryKey: ["employee", "me"],
    queryFn: () => api.get<{ id: string }>("/api/v1/hrms/employees/me"),
    staleTime: 60_000,
  });
  const isSelf = meRes?.data?.id === id;
  // HR / super_admin can edit anyone via hrms.employee.write (super_admin has "*").
  const { hasPermission } = useDashboardConfig();
  const canManageEmployees = hasPermission("hrms.employee.write");
  const canEdit = isSelf || canManageEmployees;
  // Self-service editors (no "Manage Employees" permission) may only change
  // their own personal/contact fields — the API silently drops org, comp,
  // identity and statutory changes from them (see the SELF_EDITABLE whitelist
  // in employees/[id]/route.ts). Hide those steps instead of showing fields
  // that look editable but no-op on save.
  const restrictedSelfEdit = isSelf && !canManageEmployees;
  const visibleSteps = restrictedSelfEdit ? STEPS.filter((s) => !["employment", "identity", "bank"].includes(s.id)) : STEPS;

  const [form, setForm] = useState<EmployeeData | null>(null);
  const [activeStep, setActiveStep] = useState<StepId>("personal");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<StepId, HTMLElement | null>>({
    personal: null, contact: null, employment: null, identity: null, bank: null, review: null,
  });

  useEffect(() => {
    if (empRes?.data) {
      const d = empRes.data;
      const primaryBank = (d.bankAccounts ?? []).find((b) => b?.isPrimary) ?? d.bankAccounts?.[0];
      setForm({
        ...d,
        dateOfBirth: d.dateOfBirth ? d.dateOfBirth.slice(0, 10) : "",
        dateOfJoining: d.dateOfJoining ? d.dateOfJoining.slice(0, 10) : "",
        bankName: primaryBank?.bankName ?? "",
        bankAccountNumber: primaryBank?.accountNumber ?? "",
        bankIfsc: primaryBank?.ifscCode ?? "",
        bankBranch: primaryBank?.branchName ?? "",
        bankAccountType: (primaryBank?.accountType as BankAccountType | undefined) ?? "",
      });
    }
  }, [empRes]);

  // True wizard navigation — only the active step's section renders (mirrors
  // the Add Employee form). Jumping steps resets scroll to the top.
  const stepIdx = visibleSteps.findIndex((s) => s.id === activeStep);
  const isFirstStep = stepIdx === 0;
  const isLastStep = stepIdx >= visibleSteps.length - 1;
  const goToStep = (sid: StepId) => {
    setActiveStep(sid);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };
  const nextStep = () => { if (!isLastStep) goToStep(visibleSteps[stepIdx + 1].id); };
  const prevStep = () => { if (!isFirstStep) goToStep(visibleSteps[stepIdx - 1].id); };

  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();
  const { data: locs } = useLocations();
  const { data: managers } = useQuery({ queryKey: ["employees-mgrs"], queryFn: () => api.get<Employee[]>("/api/v1/hrms/employees?limit=100&picker=1") });
  const { data: noticePeriodsData } = useQuery({ queryKey: ["notice-periods", "all"], queryFn: () => api.get<NoticePeriodOption[]>("/api/v1/hrms/offboarding/notice-periods?limit=100") });
  const noticePeriods = noticePeriodsData?.data ?? [];

  const toast = useToast();
  const dialog = useDialog();
  const updateMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/v1/hrms/employees/${id}`, body),
    onSuccess: () => {
      // Drop stale caches so the profile / directory / sidebar show the edit
      // immediately. Global staleTime is 60s, so without this a manual refresh
      // would be needed to see changes.
      qc.invalidateQueries({ queryKey: ["employee", id] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["me", "sidebar"] });
      // Auto-recorded employment-history (dept/designation/manager… changes) —
      // drop its cache so the timeline shows the new entry without a hard refresh.
      qc.invalidateQueries({ queryKey: ["employee-history", id] });
      toast.success("Changes saved");
      router.push(returnTo && returnTo.startsWith("/") ? returnTo : `/employees/${id}`);
    },
  });

  if (!form || meLoading) return (
    <div className="p-8 space-y-2">
      <SkeletonLine w="40%" h={16} />
      <SkeletonLine w="80%" h={12} />
      <SkeletonLine w="60%" h={12} />
    </div>
  );

  if (!canEdit) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <div className="surface-card overflow-hidden">
          <div className="px-4 py-4 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">Edit not allowed</h1>
              <p className="text-xs text-gray-500">You can only edit your own profile.</p>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-gray-700">
              You can only edit your own profile. To edit someone else&apos;s, you need the &ldquo;Manage Employees&rdquo; permission — ask your HR admin.
            </p>
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              <Link href={`/employees/${id}`} className="btn btn-secondary">Back to profile</Link>
              {meRes?.data?.id && (
                <Link href={`/employees/${meRes.data.id}/edit`} className="btn btn-primary">
                  <Pencil size={13} /> Edit my profile
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Actual save. Validation lives here in JS (not native `required`) because the
  // wizard hides non-active steps with display:none, and the browser refuses to
  // run native validation on a hidden required field — it throws "not focusable"
  // and silently blocks submit. So every save (from any step) routes through here.
  const doSave = async () => {
    // Mandatory fields (marked with a red * in the form). PAN/Aadhaar/Bank stay
    // recommended-but-optional on edit — many legacy imports lack them and the
    // API treats them as optional. Jump to the offending step so it's visible.
    if (!form.firstName?.trim() || !form.lastName?.trim()) {
      goToStep("personal");
      toast.error("Name required", "First and last name are required.");
      return;
    }
    if (!form.gender) {
      goToStep("personal");
      toast.error("Gender required", "Select gender in Personal Details.");
      return;
    }
    if (!form.dateOfBirth) {
      goToStep("personal");
      toast.error("Date of birth required", "Select date of birth in Personal Details.");
      return;
    }
    if (!form.workEmail?.trim()) {
      goToStep("contact");
      toast.error("Work email required", "This employee has no work email set.");
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(form.workEmail.trim())) {
      goToStep("contact");
      toast.error("Invalid work email", "Enter a valid work email address.");
      return;
    }
    if (form.personalEmail?.trim() && !emailPattern.test(form.personalEmail.trim())) {
      goToStep("contact");
      toast.error("Invalid personal email", "Enter a valid personal email address.");
      return;
    }
    // Contact-step phone checks run before Employment so the error jumps to the
    // step in wizard order (Personal → Contact → Employment).
    if (!form.personalPhone?.trim()) {
      goToStep("contact");
      toast.error("Personal phone required", "Enter the personal phone number in Contact.");
      return;
    }
    if (form.personalPhone.replace(/\D/g, "").length !== 10) {
      goToStep("contact");
      toast.error("Invalid phone", "Personal phone must be exactly 10 digits.");
      return;
    }
    if (form.workPhone?.trim() && form.workPhone.replace(/\D/g, "").length !== 10) {
      goToStep("contact");
      toast.error("Invalid work phone", "Work phone must be exactly 10 digits.");
      return;
    }
    // Employment/Identity/Bank are hidden (not just disabled) for a restricted
    // self-editor — those steps don't render, so their "required" checks would
    // otherwise permanently block save on fields the user can't even see.
    if (!restrictedSelfEdit) {
      if (!form.jobTitle?.trim() || !form.designationId || !form.departmentId || !form.officeLocationId) {
        goToStep("employment");
        toast.error("Employment details required", "Job title, designation, department and office location are mandatory.");
        return;
      }
      if (!form.reportingManagerId) {
        goToStep("employment");
        toast.error("Reporting Manager required", "Pick a reporting manager in Employment.");
        return;
      }
      if (!form.dateOfJoining) {
        goToStep("employment");
        toast.error("Date of Joining required", "Set the joining date in Employment.");
        return;
      }
      if (!form.panNumber?.trim() || !form.aadhaarNumber?.trim()) {
        goToStep("identity");
        toast.error("Identity required", "PAN and Aadhaar are mandatory.");
        return;
      }
      if (!form.bankName?.trim() || !form.bankAccountNumber?.trim() || !form.bankIfsc?.trim()) {
        goToStep("bank");
        toast.error("Bank details required", "Bank name, account number and IFSC are mandatory.");
        return;
      }
    }
    // Clear confirmation popup so the user knows the save is happening (avoids
    // the "did it save?" confusion from a silent redirect).
    const ok = await dialog.confirm({
      title: "Save changes?",
      description: `Update ${form.firstName} ${form.lastName}'s profile with your changes?`,
      confirmLabel: "Save changes",
      cancelLabel: "Keep editing",
      variant: "info",
    });
    if (!ok) return;
    updateMut.mutate({
      firstName: form.firstName,
      lastName: form.lastName,
      middleName: form.middleName || undefined,
      personalEmail: form.personalEmail || undefined,
      personalPhone: form.personalPhone || undefined,
      workPhone: form.workPhone || undefined,
      gender: form.gender || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      panNumber: form.panNumber || undefined,
      aadhaarNumber: form.aadhaarNumber || undefined,
      jobTitle: form.jobTitle || undefined,
      departmentId: form.departmentId || undefined,
      designationId: form.designationId || undefined,
      officeLocationId: form.officeLocationId || undefined,
      reportingManagerId: form.reportingManagerId || undefined,
      employmentType: form.employmentType,
      workLocation: form.workLocation,
      dateOfJoining: form.dateOfJoining,
      noticePeriodId: form.noticePeriodId ?? null,
      noticePeriodDays: form.noticePeriodDays ?? undefined,
      previousExperience: form.previousExperience ?? undefined,
      status: form.status,
      isHandicapped: form.isHandicapped ?? false,
      epfApplicable: form.epfApplicable ?? true,
      esiApplicable: form.esiApplicable ?? true,
      ptApplicable: form.ptApplicable ?? true,
      bankAccounts: form.bankName?.trim() && form.bankAccountNumber?.trim()
        ? [{
            bankName: form.bankName.trim(),
            accountNumber: form.bankAccountNumber.trim(),
            ifscCode: form.bankIfsc?.trim() || undefined,
            branchName: form.bankBranch?.trim() || undefined,
            accountType: form.bankAccountType || undefined,
            isPrimary: true,
          }]
        : undefined,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Enter / submit on a non-final step just advances, so the user never saves
    // early by pressing Enter mid-form. On the final step it saves.
    if (!isLastStep) { nextStep(); return; }
    doSave();
  };

  const update = (patch: Partial<EmployeeData>) => setForm({ ...form, ...patch });

  const deptName = depts?.data?.find((d) => d.id === form.departmentId)?.name;
  const desigName = desigs?.data?.find((d) => d.id === form.designationId)?.title;
  const locName = locs?.data?.find((l) => l.id === form.officeLocationId)?.name;
  const mgr = managers?.data?.find((m) => m.id === form.reportingManagerId);

  return (
    <div className="bg-gray-50 -m-6 min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-[#166534]/5 text-[#166534] flex items-center justify-center">
            <Pencil size={18} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900 leading-tight">Edit Employee</h1>
            <p className="text-xs text-gray-500">{form.firstName} {form.lastName}</p>
          </div>
        </div>
        <Link href={`/employees/${id}`} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <X size={18} />
        </Link>
      </header>

      <div className="bg-white border-b border-gray-100 px-5 py-4 sticky top-[57px] z-10">
        <div className="flex items-center justify-between gap-2 max-w-5xl mx-auto">
          {visibleSteps.map((s, idx) => {
            const active = activeStep === s.id;
            const passed = visibleSteps.findIndex((x) => x.id === activeStep) > idx;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => goToStep(s.id)}
                className="flex items-center gap-2.5 flex-1 min-w-0 text-left group"
              >
                <div className={clsx(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition",
                  active ? "bg-green-600 text-white"
                    : passed ? "bg-[#166534]/15 text-[#166534]"
                    : "border-2 border-gray-300 text-gray-500 bg-white",
                )}>
                  {passed ? <Check size={14} /> : idx + 1}
                </div>
                <div className="min-w-0">
                  <p className={clsx("text-[13px] font-semibold truncate leading-tight", active ? "text-[#166534]" : "text-gray-700")}>
                    {s.title}
                  </p>
                  <p className="text-[11px] text-gray-500 truncate">{s.subtitle}</p>
                </div>
                {idx < visibleSteps.length - 1 && <div className="hidden md:block flex-1 h-px bg-gray-200 mx-1" />}
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
          <div className="max-w-5xl mx-auto space-y-4 pb-5">
            <Section
              id="personal"
              icon={<User size={18} />}
              title="Personal Details"
              subtitle="Basic information about the employee."
              sectionRef={(el) => { sectionRefs.current.personal = el; }}
              active={activeStep === "personal"}
            >
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <Field label="First Name" required>
                  <IconInput icon={<User size={14} />}>
                    <input placeholder="Enter first name" value={form.firstName} onChange={(e) => update({ firstName: e.target.value })} className={inputCls} />
                  </IconInput>
                </Field>
                <Field label="Last Name" required>
                  <IconInput icon={<User size={14} />}>
                    <input placeholder="Enter last name" value={form.lastName} onChange={(e) => update({ lastName: e.target.value })} className={inputCls} />
                  </IconInput>
                </Field>
                <Field label="Middle Name">
                  <IconInput icon={<User size={14} />}>
                    <input placeholder="Enter middle name" value={form.middleName ?? ""} onChange={(e) => update({ middleName: e.target.value })} className={inputCls} />
                  </IconInput>
                </Field>
                <Field label="Gender" required>
                  <Select
                    value={form.gender ?? ""}
                    onChange={(v) => update({ gender: (v || null) as Gender | null })}
                    placeholder="Select gender"
                    options={[
                      { value: "Male", label: "Male" },
                      { value: "Female", label: "Female" },
                      { value: "Transgender", label: "Transgender" },
                      { value: "NonBinary", label: "Non-Binary" },
                      { value: "PreferNotToSay", label: "Prefer not to say" },
                    ]}
                  />
                </Field>
                <Field label="Date of Birth" required>
                  <input type="date" max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 14); return d.toISOString().slice(0, 10); })()} value={form.dateOfBirth ?? ""} onChange={(e) => update({ dateOfBirth: e.target.value })} className={inputCls} />
                </Field>
                <div />

                {/* Handicapped flag + Statutory applicability override — both
                    payroll-facing and outside SELF_EDITABLE, so hide them for
                    a self-service editor rather than let them no-op on save. */}
                {!restrictedSelfEdit && (
                  <>
                    <div className="col-span-2 pt-3 border-t border-gray-100">
                      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.isHandicapped ?? false}
                          onChange={(e) => update({ isHandicapped: e.target.checked })}
                          className="text-[#22c55e] rounded"
                        />
                        Handicapped <span className="text-xs text-gray-400">(bumps ESI ceiling to ₹25k)</span>
                      </label>
                    </div>

                    <div className="col-span-2 pt-3 border-t border-gray-100">
                      <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">
                        Statutory applicability
                      </p>
                      <p className="text-[11px] text-gray-500 mb-3">
                        Uncheck only for legitimate exclusions (contractor, expat, Excluded Employee per EPF Act).
                        Changes take effect on the next payroll run.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <EditStatutoryToggle
                          label="Apply EPF"
                          checked={form.epfApplicable ?? true}
                          onChange={(v) => update({ epfApplicable: v })}
                          hint="Uncheck for new hires above ₹15k who were never EPF members, contractors, or expats."
                        />
                        <EditStatutoryToggle
                          label="Apply ESI"
                          checked={form.esiApplicable ?? true}
                          onChange={(v) => update({ esiApplicable: v })}
                          hint="Engine already auto-skips if gross > ₹21k. Uncheck only for contractors / non-salary roles."
                        />
                        <EditStatutoryToggle
                          label="Apply Professional Tax"
                          checked={form.ptApplicable ?? true}
                          onChange={(v) => update({ ptApplicable: v })}
                          hint="Uncheck for expats / non-residents or where state exempts the employee category."
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Section>

            <Section
              id="contact"
              icon={<Phone size={18} />}
              title="Contact"
              subtitle="Contact information for communication."
              sectionRef={(el) => { sectionRefs.current.contact = el; }}
              active={activeStep === "contact"}
            >
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <Field label="Work Email" required>
                  <IconInput icon={<Lock size={14} />}>
                    <input
                      value={form.workEmail}
                      disabled
                      title="Work email is locked and can't be edited here"
                      className={`${inputCls} bg-gray-100 text-gray-500 cursor-not-allowed`}
                    />
                  </IconInput>
                </Field>
                <Field label="Personal Email">
                  <IconInput icon={<Mail size={14} />}>
                    <input type="email" placeholder="personal.email@example.com" value={form.personalEmail ?? ""} onChange={(e) => update({ personalEmail: e.target.value })} className={inputCls} />
                  </IconInput>
                </Field>
                <Field label="Personal Phone" required>
                  <IconInput icon={<Phone size={14} />}>
                    <input inputMode="tel" maxLength={15} placeholder="Enter personal phone number" value={form.personalPhone ?? ""} onChange={(e) => update({ personalPhone: sanitizePhone(e.target.value) })} className={inputCls} />
                  </IconInput>
                </Field>
                <Field label="Work Phone">
                  <IconInput icon={<Phone size={14} />}>
                    <input inputMode="tel" maxLength={15} placeholder="Enter work phone number" value={form.workPhone ?? ""} onChange={(e) => update({ workPhone: sanitizePhone(e.target.value) })} className={inputCls} />
                  </IconInput>
                </Field>
              </div>
            </Section>

            {!restrictedSelfEdit && (
            <Section
              id="employment"
              icon={<Briefcase size={18} />}
              title="Employment"
              subtitle="Job and employment related information."
              sectionRef={(el) => { sectionRefs.current.employment = el; }}
              active={activeStep === "employment"}
            >
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <Field label="Job Title" required>
                  <IconInput icon={<Briefcase size={14} />}>
                    <input placeholder="Enter job title" value={form.jobTitle ?? ""} onChange={(e) => update({ jobTitle: e.target.value })} className={inputCls} />
                  </IconInput>
                </Field>
                <Field label="Designation" required>
                  <Select
                    value={form.designationId ?? ""}
                    onChange={(v) => update({ designationId: v || null })}
                    placeholder="Select designation"
                    searchable
                    options={(desigs?.data ?? []).map((d) => ({ value: d.id, label: d.title }))}
                  />
                </Field>
                <Field label="Department" required>
                  <Select
                    value={form.departmentId ?? ""}
                    onChange={(v) => update({ departmentId: v || null })}
                    placeholder="Select department"
                    searchable
                    options={(depts?.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
                  />
                </Field>
                <Field label="Office Location" required>
                  <Select
                    value={form.officeLocationId ?? ""}
                    onChange={(v) => update({ officeLocationId: v || null })}
                    placeholder="Select location"
                    searchable
                    options={(locs?.data ?? []).map((l) => ({ value: l.id, label: l.name }))}
                  />
                </Field>
                <Field label="Reporting Manager" required>
                  <Select
                    value={form.reportingManagerId ?? ""}
                    onChange={(v) => update({ reportingManagerId: v || null })}
                    placeholder="Search manager"
                    searchable
                    options={(managers?.data ?? []).filter((m) => m.id !== id).map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))}
                  />
                </Field>
                <Field label="Date of Joining" required>
                  <input type="date" value={form.dateOfJoining} onChange={(e) => update({ dateOfJoining: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Employment Type">
                  <Select
                    value={form.employmentType}
                    onChange={(v) => update({ employmentType: v as EmploymentType })}
                    options={EMP_TYPES.map((t) => ({ value: t, label: t === "FullTime" ? "Full Time" : t === "PartTime" ? "Part Time" : t }))}
                  />
                </Field>
                <Field label="Work Location Type">
                  <Select
                    value={form.workLocation}
                    onChange={(v) => update({ workLocation: v as WorkLocation })}
                    options={WORK_LOCS.map((w) => ({ value: w, label: w }))}
                  />
                </Field>
                <Field label="Notice Period">
                  <Select
                    value={form.noticePeriodId ?? ""}
                    onChange={(v) => {
                      const p = noticePeriods.find((n) => n.id === v);
                      update({ noticePeriodId: v || null, noticePeriodDays: p ? periodToDays(p) : null });
                    }}
                    placeholder={noticePeriods.length ? "Select notice period" : "No notice periods — add in Offboarding"}
                    options={noticePeriods.map((n) => ({ value: n.id, label: `${n.name} (${n.duration} ${n.unit})` }))}
                  />
                </Field>
                <Field label="Previous Experience (months)">
                  <NumberInput allowDecimal={false} value={form.previousExperience} onChange={(v) => update({ previousExperience: v })} className={inputCls} />
                </Field>
              </div>
            </Section>
            )}

            {!restrictedSelfEdit && (
            <Section
              id="identity"
              icon={<ShieldCheck size={18} />}
              title="Identity *"
              subtitle="PAN and Aadhaar mandatory."
              sectionRef={(el) => { sectionRefs.current.identity = el; }}
              active={activeStep === "identity"}
            >
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <Field label="PAN Number" required>
                  <IconInput icon={<IdCard size={14} />}>
                    <input placeholder="Enter PAN number" value={form.panNumber ?? ""} onChange={(e) => update({ panNumber: e.target.value.toUpperCase() })} className={`${inputCls} font-mono text-sm`} maxLength={10} />
                  </IconInput>
                </Field>
                <Field label="Aadhaar Number" required>
                  <IconInput icon={<IdCard size={14} />}>
                    <input inputMode="numeric" placeholder="Enter Aadhaar number" value={form.aadhaarNumber ?? ""} onChange={(e) => update({ aadhaarNumber: sanitizeDigits(e.target.value) })} className={`${inputCls} font-mono tracking-widest text-sm`} maxLength={12} />
                  </IconInput>
                </Field>
              </div>
            </Section>
            )}

            {!restrictedSelfEdit && (
            <Section
              id="bank"
              icon={<Banknote size={18} />}
              title="Bank Details *"
              subtitle="Bank name, account number and IFSC are mandatory."
              sectionRef={(el) => { sectionRefs.current.bank = el; }}
              active={activeStep === "bank"}
            >
              <BankDetailsFields
                markRequired
                value={{
                  bankName: form.bankName ?? "",
                  bankAccountNumber: form.bankAccountNumber ?? "",
                  bankIfsc: form.bankIfsc ?? "",
                  bankBranch: form.bankBranch ?? "",
                  bankAccountType: form.bankAccountType ?? "",
                }}
                onChange={(patch) => update(patch)}
                inputCls={inputCls}
              />
            </Section>
            )}

            <Section
              id="review"
              icon={<ClipboardCheck size={18} />}
              title="Review"
              subtitle="Verify details before saving changes."
              sectionRef={(el) => { sectionRefs.current.review = el; }}
              active={activeStep === "review"}
            >
              <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
                <ReviewRow icon={<User size={13} />} label="Full Name" value={[form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ") || "—"} />
                <ReviewRow icon={<Mail size={13} />} label="Work Email" value={form.workEmail || "—"} />
                <ReviewRow icon={<Calendar size={13} />} label="Date of Birth" value={form.dateOfBirth || "—"} />
                <ReviewRow icon={<Phone size={13} />} label="Personal Phone" value={form.personalPhone || "—"} />
                <ReviewRow icon={<Briefcase size={13} />} label="Job Title" value={form.jobTitle || "—"} />
                <ReviewRow icon={<Building2 size={13} />} label="Department" value={deptName ?? "—"} />
                <ReviewRow icon={<ShieldCheck size={13} />} label="Designation" value={desigName ?? "—"} />
                <ReviewRow icon={<MapPin size={13} />} label="Office Location" value={locName ?? "—"} />
                <ReviewRow icon={<User size={13} />} label="Reporting Manager" value={mgr ? `${mgr.firstName} ${mgr.lastName}` : "—"} />
                <ReviewRow icon={<Calendar size={13} />} label="Date of Joining" value={form.dateOfJoining || "—"} />
                <ReviewRow icon={<Briefcase size={13} />} label="Employment Type" value={form.employmentType} />
                <ReviewRow icon={<MapPin size={13} />} label="Work Location" value={form.workLocation} />
                <ReviewRow icon={<IdCard size={13} />} label="PAN" value={form.panNumber || "—"} />
                <ReviewRow icon={<IdCard size={13} />} label="Aadhaar" value={form.aadhaarNumber || "—"} />
                <ReviewRow icon={<Banknote size={13} />} label="Bank" value={form.bankName ? `${form.bankName} · ${form.bankAccountNumber}` : "—"} />
                <ReviewRow icon={<IdCard size={13} />} label="IFSC" value={form.bankIfsc || "—"} />
              </div>
            </Section>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-5 py-3 flex items-center justify-between gap-2 z-10">
          <div className="flex items-center gap-2">
            <Link href={`/employees/${id}`} className="btn btn-ghost">Cancel</Link>
            <span className="text-xs text-gray-400 hidden sm:inline">Step {stepIdx + 1} of {visibleSteps.length}</span>
          </div>
          <div className="flex items-center gap-2">
            {!isFirstStep && (
              <button type="button" onClick={prevStep} className="btn btn-secondary">
                <ArrowLeft size={14} /> Back
              </button>
            )}
            {!isLastStep ? (
              <>
                {/* Editing existing data — let the user save from any step
                    instead of forcing a walk to the final Review step. */}
                <button type="button" onClick={doSave} disabled={updateMut.isPending} className="btn btn-secondary">
                  <Save size={13} /> {updateMut.isPending ? "Saving..." : "Save changes"}
                </button>
                <button type="button" onClick={nextStep} className="btn btn-primary">
                  Next <ArrowRight size={13} />
                </button>
              </>
            ) : (
              <button type="button" onClick={doSave} disabled={updateMut.isPending} className="btn btn-primary">
                <Save size={13} /> {updateMut.isPending ? "Saving..." : "Save Changes"}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

const inputCls = "w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-[#166534]";

function sanitizeDigits(v: string): string {
  return v.replace(/\D/g, "");
}
function sanitizePhone(v: string): string {
  const plus = v.trim().startsWith("+") ? "+" : "";
  return plus + v.replace(/\D/g, "");
}

function IconInput({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10">{icon}</span>
      <div className="[&>input]:!pl-9">{children}</div>
    </div>
  );
}

function Section({
  id, icon, title, subtitle, children, sectionRef, active,
}: {
  id: StepId;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  sectionRef: (el: HTMLElement | null) => void;
  active: boolean;
}) {
  return (
    <section ref={sectionRef} data-step-id={id} className={clsx("surface-card p-4", !active && "hidden")}>
      <div className="flex items-start gap-2.5 mb-4 pb-4 border-b border-gray-100">
        <div className="w-9 h-9 rounded-xl bg-[#166534]/5 text-[#166534] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div>
          <h2 className="text-[13px] font-semibold text-gray-900 leading-tight">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-800 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function ReviewRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-400">{icon}</span>
      <span className="text-xs text-gray-500 w-40 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 truncate">{value}</span>
    </div>
  );
}

function EditStatutoryToggle({ label, checked, onChange, hint }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint: string;
}) {
  return (
    <div className={`rounded-lg ring-1 p-3 transition ${checked ? "ring-emerald-200 bg-emerald-50/40" : "ring-amber-200 bg-amber-50/40"}`}>
      <label className="flex items-center gap-2 text-xs font-medium text-gray-800 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded text-[#22c55e]"
        />
        {label}
        <span className={`ml-auto text-[11px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-full ${checked ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {checked ? "Default" : "Excluded"}
        </span>
      </label>
      <p className="text-[11px] text-gray-500 mt-1 leading-snug">{hint}</p>
    </div>
  );
}
