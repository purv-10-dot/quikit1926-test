"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDepartments, useDesignations, useLocations, useRoles, useSalaryTemplates } from "@/lib/hooks/use-ref-data";
import { useToast } from "@/components/hrms/toast";
import {
  X, UserPlus, User, Phone, Briefcase, ShieldCheck, ClipboardCheck,
  Mail, Calendar, MapPin, Building2, IdCard, Save, Check, Banknote,
  ShieldAlert, Plus, Trash2, GraduationCap, History, Users, Award,
} from "lucide-react";
import { FormInput } from "@/components/hrms/form";
import { clsx } from "clsx";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { BankDetailsFields } from "@/components/hrms/bank-details-fields";

type EmploymentType = "FullTime" | "PartTime" | "Contract" | "Intern" | "Freelancer" | "Consultant";
type WorkLocation = "Office" | "Remote" | "Hybrid";
type EmployeeStatus = "Active" | "PreBoarding" | "OnLeave" | "OnNotice" | "Suspended";
type Gender = "Male" | "Female" | "NonBinary" | "PreferNotToSay";

interface Department { id: string; name: string; }
interface Designation { id: string; title: string; }
interface Location { id: string; name: string; }
interface Employee { id: string; firstName: string; lastName: string; }
interface Role { id: string; code: string; name: string; }
interface SalaryTemplate { id: string; name: string; code: string; }

const EMP_TYPES: EmploymentType[] = ["FullTime", "PartTime", "Contract", "Intern", "Freelancer", "Consultant"];
const WORK_LOCS: WorkLocation[] = ["Office", "Remote", "Hybrid"];

const STEPS = [
  { id: "personal",   num: 1,  title: "Personal Details", subtitle: "Basic information",       icon: <User size={16} /> },
  { id: "contact",    num: 2,  title: "Contact",          subtitle: "Contact details",         icon: <Phone size={16} /> },
  { id: "emergency",  num: 3,  title: "Emergency Contact", subtitle: "Next of kin / SOS",      icon: <ShieldAlert size={16} /> },
  { id: "address",    num: 4,  title: "Address",          subtitle: "Present & permanent",     icon: <MapPin size={16} /> },
  { id: "employment", num: 5,  title: "Employment",       subtitle: "Job & work details",      icon: <Briefcase size={16} /> },
  { id: "education",  num: 6,  title: "Education",        subtitle: "Academic history",        icon: <GraduationCap size={16} /> },
  { id: "experience", num: 7,  title: "Experience",       subtitle: "Past roles",              icon: <History size={16} /> },
  { id: "family",     num: 8,  title: "Family Details",   subtitle: "Dependents & relatives",  icon: <Users size={16} /> },
  { id: "certifications", num: 9, title: "Certifications", subtitle: "Courses & credentials",  icon: <Award size={16} /> },
  { id: "identity",   num: 10, title: "Identity",         subtitle: "KYC information",         icon: <ShieldCheck size={16} /> },
  { id: "bank",       num: 11, title: "Bank Details",     subtitle: "Salary credit account",   icon: <Banknote size={16} /> },
  { id: "review",     num: 12, title: "Review",           subtitle: "Review & confirm",        icon: <ClipboardCheck size={16} /> },
] as const;

interface EmergencyContact { name: string; relationship: string; phone: string; email: string; address: string; }
const emptyEmergencyContact: EmergencyContact = { name: "", relationship: "", phone: "", email: "", address: "" };
const RELATIONS = ["Spouse", "Parent", "Sibling", "Child", "Friend", "Relative", "Other"];

interface Address { line1: string; line2: string; city: string; country: string; state: string; postalCode: string; }
const emptyAddress: Address = { line1: "", line2: "", city: "", country: "", state: "", postalCode: "" };

interface Education { institution: string; degree: string; fieldOfStudy: string; startYear: string; endYear: string; }
const emptyEducation: Education = { institution: "", degree: "", fieldOfStudy: "", startYear: "", endYear: "" };

// Topgrading career-history entry — structured depth per role (accomplishments,
// compensation, reason for leaving, and the boss-appraisal / TORC fields).
interface Experience {
  company: string;
  designation: string; // Title / position
  startDate: string;
  endDate: string;
  currentlyWorkHere: boolean;
  startCompensation: string;
  endCompensation: string;
  responsibilities: string;
  accomplishments: string;
  challenges: string;
  reasonForLeaving: string;
  supervisorName: string;
  supervisorTitle: string;
  bossStrengths: string;
  bossWeaknesses: string;
}
const emptyExperience: Experience = {
  company: "", designation: "", startDate: "", endDate: "", currentlyWorkHere: false,
  startCompensation: "", endCompensation: "", responsibilities: "", accomplishments: "",
  challenges: "", reasonForLeaving: "", supervisorName: "", supervisorTitle: "",
  bossStrengths: "", bossWeaknesses: "",
};

interface FamilyMember { name: string; relation: string; dob: string; occupation: string; }
const emptyFamilyMember: FamilyMember = { name: "", relation: "", dob: "", occupation: "" };
const FAMILY_RELATIONS = ["Spouse", "Father", "Mother", "Son", "Daughter", "Brother", "Sister", "Father-in-law", "Mother-in-law", "Other"];

interface Certification { name: string; courseName: string; issuingAuthority: string; year: string; expiryDate: string; credentialUrl: string; }
const emptyCertification: Certification = { name: "", courseName: "", issuingAuthority: "", year: "", expiryDate: "", credentialUrl: "" };

const COUNTRY_OPTS = [
  { value: "IN", label: "India" },
  { value: "US", label: "United States" },
  { value: "UK", label: "United Kingdom" },
];
const STATE_OPTS = [
  { value: "Maharashtra", label: "Maharashtra" },
  { value: "Karnataka", label: "Karnataka" },
  { value: "Delhi", label: "Delhi" },
];

function hasAddress(a: Address): boolean {
  return !!(a.line1 || a.line2 || a.city || a.state || a.country || a.postalCode);
}

// Backend addressSchema requires line1, city, state, country, zipCode (all min(1)).
// Map our local "postalCode" key to "zipCode" + fall back to safe defaults so partial
// addresses still validate (line2 stays optional).
function toApiAddress(a: Address) {
  return {
    line1: a.line1 || a.line2 || "—",
    line2: a.line2 || undefined,
    city: a.city || "—",
    state: a.state || "—",
    country: a.country || "—",
    zipCode: a.postalCode || "—",
  };
}

type StepId = typeof STEPS[number]["id"];

export default function NewEmployeePage() {
  return (
    <Suspense fallback={<div className="p-6 space-y-2"><SkeletonLine w="40%" h={16} /><SkeletonLine w="70%" h={12} /><SkeletonLine w="60%" h={12} /></div>}>
      <NewEmployeePageInner />
    </Suspense>
  );
}

function NewEmployeePageInner() {
  const api = useApiClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  const [form, setForm] = useState({
    firstName: "", lastName: "", middleName: "",
    workEmail: "", personalEmail: "", personalPhone: "", workPhone: "",
    gender: "" as Gender | "",
    dateOfBirth: "",
    isHandicapped: false,
    isSeniorCitizen: false,
    // Statutory applicability — default true; admin unchecks only for legitimate exclusions.
    epfApplicable: true,
    esiApplicable: true,
    ptApplicable: true,
    epfContributionRate: "" as "" | "TwelvePercentActual" | "TwelvePercentRestricted",
    panNumber: "", aadhaarNumber: "",
    jobTitle: "",
    departmentId: "", designationId: "", officeLocationId: "", reportingManagerId: "", roleId: "",
    employmentType: "FullTime" as EmploymentType,
    workLocation: "Office" as WorkLocation,
    dateOfJoining: "",
    noticePeriodDays: null as number | null,
    previousExperience: null as number | null,
    status: "Active" as EmployeeStatus,
    bankName: "",
    bankAccountNumber: "",
    bankIfsc: "",
    bankBranch: "",
    bankAccountType: "" as "" | "Savings" | "Current" | "Salary" | "NRE" | "NRO",
    salaryTemplateId: "",
    ctcLpa: null as number | null,
    emergencyContacts: [{ ...emptyEmergencyContact }] as EmergencyContact[],
    currentAddress: { ...emptyAddress },
    permanentAddress: { ...emptyAddress },
    sameAsPresent: false,
    educations: [{ ...emptyEducation }] as Education[],
    pastExperiences: [{ ...emptyExperience }] as Experience[],
    familyMembers: [{ ...emptyFamilyMember }] as FamilyMember[],
    certifications: [{ ...emptyCertification }] as Certification[],
  });

  const [activeStep, setActiveStep] = useState<StepId>("personal");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<StepId, HTMLElement | null>>({
    personal: null, contact: null, emergency: null, address: null, employment: null,
    education: null, experience: null, family: null, certifications: null,
    identity: null, bank: null, review: null,
  });

  const addEmergencyContact = () => setForm((f) => ({ ...f, emergencyContacts: [...f.emergencyContacts, { ...emptyEmergencyContact }] }));
  const removeEmergencyContact = (i: number) => setForm((f) => ({ ...f, emergencyContacts: f.emergencyContacts.filter((_, idx) => idx !== i) }));
  const updateEmergencyContact = (i: number, key: keyof EmergencyContact, v: string) =>
    setForm((f) => ({ ...f, emergencyContacts: f.emergencyContacts.map((c, idx) => idx === i ? { ...c, [key]: v } : c) }));

  const updateAddress = (field: "currentAddress" | "permanentAddress", key: keyof Address, value: string) =>
    setForm((f) => ({ ...f, [field]: { ...f[field], [key]: value } }));

  const addEducation = () => setForm((f) => ({ ...f, educations: [...f.educations, { ...emptyEducation }] }));
  const removeEducation = (i: number) => setForm((f) => ({ ...f, educations: f.educations.filter((_, idx) => idx !== i) }));
  const updateEducation = (i: number, key: keyof Education, v: string) =>
    setForm((f) => ({ ...f, educations: f.educations.map((e, idx) => idx === i ? { ...e, [key]: v } : e) }));

  const addExperience = () => setForm((f) => ({ ...f, pastExperiences: [...f.pastExperiences, { ...emptyExperience }] }));
  const removeExperience = (i: number) => setForm((f) => ({ ...f, pastExperiences: f.pastExperiences.filter((_, idx) => idx !== i) }));
  const updateExperience = (i: number, key: keyof Experience, v: string | boolean) =>
    setForm((f) => ({ ...f, pastExperiences: f.pastExperiences.map((e, idx) => idx === i ? { ...e, [key]: v } : e) }));

  const addFamilyMember = () => setForm((f) => ({ ...f, familyMembers: [...f.familyMembers, { ...emptyFamilyMember }] }));
  const removeFamilyMember = (i: number) => setForm((f) => ({ ...f, familyMembers: f.familyMembers.filter((_, idx) => idx !== i) }));
  const updateFamilyMember = (i: number, key: keyof FamilyMember, v: string) =>
    setForm((f) => ({ ...f, familyMembers: f.familyMembers.map((m, idx) => idx === i ? { ...m, [key]: v } : m) }));

  const addCertification = () => setForm((f) => ({ ...f, certifications: [...f.certifications, { ...emptyCertification }] }));
  const removeCertification = (i: number) => setForm((f) => ({ ...f, certifications: f.certifications.filter((_, idx) => idx !== i) }));
  const updateCertification = (i: number, key: keyof Certification, v: string) =>
    setForm((f) => ({ ...f, certifications: f.certifications.map((c, idx) => idx === i ? { ...c, [key]: v } : c) }));

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const id = (visible[0].target as HTMLElement).dataset.stepId as StepId | undefined;
          if (id) setActiveStep(id);
        }
      },
      { root, rootMargin: "-15% 0px -65% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    Object.values(sectionRefs.current).forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const scrollToStep = (id: StepId) => {
    const el = sectionRefs.current[id];
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
      setActiveStep(id);
    }
  };

  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();
  const { data: locs } = useLocations();
  const { data: managers } = useQuery({ queryKey: ["employees-mgrs"], queryFn: () => api.get<Employee[]>("/api/v1/hrms/employees?limit=100") });
  const { data: roles } = useRoles();
  const { data: salaryTemplates } = useSalaryTemplates();

  const toast = useToast();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingBody, setPendingBody] = useState<Record<string, unknown> | null>(null);

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/employees", body),
    onSuccess: (_res, variables) => {
      const invited = (variables as Record<string, unknown>)?.sendInvite === true;
      toast.success("Employee added", `${form.firstName} ${form.lastName}${invited ? " · portal invite sent" : ""}`);
      router.push(returnTo && returnTo.startsWith("/") ? returnTo : "/employees");
    },
    // Errors handled by global MutationCache.onError in providers.tsx (single toast).
  });

  const confirmCreate = (sendInvite: boolean) => {
    if (!pendingBody) return;
    setInviteOpen(false);
    createMut.mutate({ ...pendingBody, sendInvite });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.reportingManagerId) {
      toast.error("Reporting Manager required", "Pick a manager in Employment step.");
      scrollToStep("employment");
      return;
    }
    if (!form.roleId) {
      toast.error("Role required", "Pick a role in Employment step.");
      scrollToStep("employment");
      return;
    }
    if (!form.salaryTemplateId) {
      toast.error("Salary template required", "Pick a template in Employment step.");
      scrollToStep("employment");
      return;
    }
    if (form.ctcLpa == null || form.ctcLpa <= 0) {
      toast.error("CTC (LPA) required", "Enter annual CTC in lakhs in Employment step.");
      scrollToStep("employment");
      return;
    }
    if (!form.gender) {
      toast.error("Gender required", "Select gender in Personal step.");
      scrollToStep("personal");
      return;
    }
    if (!hasAddress(form.currentAddress) || !form.currentAddress.line1.trim() || !form.currentAddress.city.trim() || !form.currentAddress.state.trim() || !form.currentAddress.country.trim() || !form.currentAddress.postalCode.trim()) {
      toast.error("Address required", "Fill current address (line1, city, state, country, postal code).");
      scrollToStep("address");
      return;
    }
    const validEducations = form.educations.filter((e) => e.institution?.trim() && e.degree?.trim());
    if (validEducations.length === 0) {
      toast.error("Education required", "Add at least one education entry with institution + degree.");
      scrollToStep("education");
      return;
    }
    if (!form.panNumber.trim() || !form.aadhaarNumber.trim()) {
      toast.error("Identity required", "PAN and Aadhaar are mandatory in Identity step.");
      scrollToStep("identity");
      return;
    }
    if (!form.bankName.trim() || !form.bankAccountNumber.trim() || !form.bankIfsc.trim()) {
      toast.error("Bank details required", "Bank name, account number and IFSC are mandatory.");
      scrollToStep("bank");
      return;
    }
    const body: Record<string, unknown> = {
      firstName: form.firstName,
      lastName: form.lastName,
      middleName: form.middleName || undefined,
      workEmail: form.workEmail,
      personalEmail: form.personalEmail || undefined,
      personalPhone: form.personalPhone || undefined,
      workPhone: form.workPhone || undefined,
      gender: form.gender || undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      isHandicapped: form.isHandicapped,
      isSeniorCitizen: form.isSeniorCitizen,
      epfApplicable: form.epfApplicable,
      esiApplicable: form.esiApplicable,
      ptApplicable: form.ptApplicable,
      epfContributionRate: form.epfContributionRate || undefined,
      panNumber: form.panNumber || undefined,
      aadhaarNumber: form.aadhaarNumber || undefined,
      jobTitle: form.jobTitle || undefined,
      departmentId: form.departmentId || undefined,
      designationId: form.designationId || undefined,
      officeLocationId: form.officeLocationId || undefined,
      reportingManagerId: form.reportingManagerId || undefined,
      roleId: form.roleId || undefined,
      salaryTemplateId: form.salaryTemplateId || undefined,
      ctcLpa: form.ctcLpa ?? undefined,
      employmentType: form.employmentType,
      workLocation: form.workLocation,
      dateOfJoining: form.dateOfJoining,
      noticePeriodDays: form.noticePeriodDays ?? undefined,
      previousExperience: form.previousExperience ?? undefined,
      status: form.status,
      bankAccounts: form.bankName.trim() && form.bankAccountNumber.trim()
        ? [{
            bankName: form.bankName.trim(),
            accountNumber: form.bankAccountNumber.trim(),
            ifscCode: form.bankIfsc.trim() || undefined,
            branchName: form.bankBranch.trim() || undefined,
            accountType: form.bankAccountType || undefined,
            isPrimary: true,
          }]
        : undefined,
      emergencyContacts: form.emergencyContacts
        .filter((c) => c.name && c.relationship && c.phone)
        .map((c) => ({
          name: c.name,
          relationship: c.relationship,
          phone: c.phone,
          email: c.email || undefined,
          address: c.address || undefined,
        })),
      currentAddress: hasAddress(form.currentAddress) ? toApiAddress(form.currentAddress) : undefined,
      permanentAddress: form.sameAsPresent
        ? (hasAddress(form.currentAddress) ? toApiAddress(form.currentAddress) : undefined)
        : (hasAddress(form.permanentAddress) ? toApiAddress(form.permanentAddress) : undefined),
      educations: form.educations
        .filter((e) => e.institution.trim() && e.degree.trim())
        .map((e) => ({
          institution: e.institution.trim(),
          degree: e.degree.trim(),
          fieldOfStudy: e.fieldOfStudy.trim() || undefined,
          startYear: e.startYear.trim() ? parseInt(e.startYear, 10) : undefined,
          endYear: e.endYear.trim() ? parseInt(e.endYear, 10) : undefined,
        })),
      pastExperiences: form.pastExperiences
        .filter((e) => e.company.trim() || e.designation.trim())
        .map((e) => ({
          company: e.company || undefined,
          designation: e.designation || undefined,
          startDate: e.startDate || undefined,
          endDate: e.currentlyWorkHere ? undefined : (e.endDate || undefined),
          currentlyWorkHere: e.currentlyWorkHere,
          startCompensation: e.startCompensation || undefined,
          endCompensation: e.endCompensation || undefined,
          responsibilities: e.responsibilities || undefined,
          accomplishments: e.accomplishments || undefined,
          challenges: e.challenges || undefined,
          reasonForLeaving: e.reasonForLeaving || undefined,
          supervisorName: e.supervisorName || undefined,
          supervisorTitle: e.supervisorTitle || undefined,
          bossStrengths: e.bossStrengths || undefined,
          bossWeaknesses: e.bossWeaknesses || undefined,
        })),
      certifications: form.certifications
        .filter((c) => c.name && c.issuingAuthority)
        .map((c) => ({
          name: c.name,
          courseName: c.courseName || undefined,
          issuingBody: c.issuingAuthority,
          issueDate: c.year ? `${c.year}-01-01` : new Date().toISOString().slice(0, 10),
          year: c.year || undefined,
          expiryDate: c.expiryDate || undefined,
          credentialUrl: c.credentialUrl || undefined,
        })),
      customFields: {
        familyMembers: form.familyMembers.filter((m) => m.name && m.relation),
      },
    };
    // All validations passed — ask whether to send a portal invite before creating.
    setPendingBody(body);
    setInviteOpen(true);
  };

  const deptName = depts?.data?.find((d) => d.id === form.departmentId)?.name;
  const desigName = desigs?.data?.find((d) => d.id === form.designationId)?.title;
  const locName = locs?.data?.find((l) => l.id === form.officeLocationId)?.name;
  const mgr = managers?.data?.find((m) => m.id === form.reportingManagerId);

  return (
    <div className="bg-gray-50 -m-6 flex flex-col h-[calc(100vh-0px)] min-h-screen">
      <header className="bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-[#16243A]/5 text-[#16243A] flex items-center justify-center">
            <UserPlus size={18} />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Add Employee</h1>
        </div>
        <Link href="/org-chart" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <X size={18} />
        </Link>
      </header>

      <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-[57px] z-10">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            {STEPS.map((s, idx) => {
              const active = activeStep === s.id;
              const passed = STEPS.findIndex((x) => x.id === activeStep) > idx;
              return (
                <div key={s.id} className="flex items-center flex-1 last:flex-none">
                  <button
                    type="button"
                    onClick={() => scrollToStep(s.id)}
                    title={`${s.num}. ${s.title} — ${s.subtitle}`}
                    aria-label={`${s.num}. ${s.title}`}
                    className={clsx(
                      "w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition",
                      active ? "bg-[#16243A] text-white ring-4 ring-[#16243A]/10"
                        : passed ? "bg-[#16243A]/15 text-[#16243A] hover:bg-[#16243A]/25"
                        : "border-2 border-gray-300 text-gray-500 bg-white hover:border-gray-400",
                    )}
                  >
                    {passed ? <Check size={15} /> : <span className="flex items-center gap-0.5">{s.icon}</span>}
                  </button>
                  {idx < STEPS.length - 1 && (
                    <div className={clsx(
                      "flex-1 h-0.5 mx-1.5 rounded transition",
                      passed ? "bg-[#16243A]/40" : "bg-gray-200",
                    )} />
                  )}
                </div>
              );
            })}
          </div>
          {(() => {
            const cur = STEPS.find((x) => x.id === activeStep) ?? STEPS[0];
            return (
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Step {cur.num} of {STEPS.length}
                </span>
                <span className="text-sm font-semibold text-[#16243A]">{cur.title}</span>
                <span className="text-xs text-gray-500">— {cur.subtitle}</span>
              </div>
            );
          })()}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-5xl mx-auto space-y-5 pb-8">
            <Section
              id="personal"
              icon={<User size={18} />}
              title="Personal Details"
              subtitle="Basic information about the employee."
              sectionRef={(el) => { sectionRefs.current.personal = el; }}
            >
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <Field label="First Name" required>
                  <IconInput icon={<User size={14} />}>
                    <input required placeholder="Enter first name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={inputCls} />
                  </IconInput>
                </Field>
                <Field label="Last Name" required>
                  <IconInput icon={<User size={14} />}>
                    <input required placeholder="Enter last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={inputCls} />
                  </IconInput>
                </Field>
                <Field label="Middle Name">
                  <IconInput icon={<User size={14} />}>
                    <input placeholder="Enter middle name" value={form.middleName} onChange={(e) => setForm({ ...form, middleName: e.target.value })} className={inputCls} />
                  </IconInput>
                </Field>
                <Field label="Gender" required>
                  <Select
                    value={form.gender}
                    onChange={(v) => setForm({ ...form, gender: v as Gender })}
                    placeholder="Select gender"
                    options={[
                      { value: "Male", label: "Male" },
                      { value: "Female", label: "Female" },
                      { value: "NonBinary", label: "Non-Binary" },
                      { value: "PreferNotToSay", label: "Prefer not to say" },
                    ]}
                  />
                </Field>
                <Field label="Date of Birth" required>
                  <input
                    type="date"
                    required
                    value={form.dateOfBirth}
                    onChange={(e) => {
                      const dob = e.target.value;
                      let isSenior = false;
                      if (dob) {
                        const birth = new Date(dob);
                        const today = new Date();
                        let age = today.getFullYear() - birth.getFullYear();
                        const m = today.getMonth() - birth.getMonth();
                        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
                        isSenior = age > 60;
                      }
                      setForm({ ...form, dateOfBirth: dob, isSeniorCitizen: isSenior });
                    }}
                    className={inputCls}
                  />
                </Field>
                <div className="col-span-2 flex items-center gap-6 pt-1">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isHandicapped}
                      onChange={(e) => setForm({ ...form, isHandicapped: e.target.checked })}
                      className="text-[#3b82f6] rounded"
                    />
                    Handicapped
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-not-allowed" title="Auto-checked when age greater than 60">
                    <input
                      type="checkbox"
                      checked={form.isSeniorCitizen}
                      readOnly
                      disabled
                      className="text-[#3b82f6] rounded"
                    />
                    Senior Citizen <span className="text-xs text-gray-400">(auto from DOB &gt; 60)</span>
                  </label>
                </div>

                {/* Statutory Applicability — per-employee opt-out of EPF / ESI / PT.
                    Defaults to all-true; unchecking suppresses that deduction in payroll. */}
                <div className="col-span-2 pt-3 border-t border-gray-100">
                  <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-1">
                    Statutory applicability
                  </p>
                  <p className="text-[11px] text-gray-500 mb-3">
                    Uncheck only for legitimate exclusions (contractor, expat, Excluded Employee per EPF Act).
                    Affects payroll deductions for this employee only.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <StatutoryToggle
                      label="Apply EPF"
                      checked={form.epfApplicable}
                      onChange={(v) => setForm({ ...form, epfApplicable: v })}
                      hint="Uncheck for new hires above ₹15k who were never EPF members, contractors, or expats."
                    />
                    <StatutoryToggle
                      label="Apply ESI"
                      checked={form.esiApplicable}
                      onChange={(v) => setForm({ ...form, esiApplicable: v })}
                      hint="Engine already auto-skips if gross > ₹21k. Uncheck only for contractors / non-salary engagements."
                    />
                    <StatutoryToggle
                      label="Apply Professional Tax"
                      checked={form.ptApplicable}
                      onChange={(v) => setForm({ ...form, ptApplicable: v })}
                      hint="Uncheck for expats / non-residents or where state exempts the employee category."
                    />
                  </div>
                </div>
              </div>
            </Section>

            <Section
              id="contact"
              icon={<Phone size={18} />}
              title="Contact"
              subtitle="Contact information for communication."
              sectionRef={(el) => { sectionRefs.current.contact = el; }}
            >
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <Field label="Work Email" required>
                  <IconInput icon={<Mail size={14} />}>
                    <input type="email" required placeholder="work.email@example.com" value={form.workEmail} onChange={(e) => setForm({ ...form, workEmail: e.target.value })} className={inputCls} />
                  </IconInput>
                </Field>
                <Field label="Personal Email">
                  <IconInput icon={<Mail size={14} />}>
                    <input type="email" placeholder="personal.email@example.com" value={form.personalEmail} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} className={inputCls} />
                  </IconInput>
                </Field>
                <Field label="Personal Phone">
                  <IconInput icon={<Phone size={14} />}>
                    <input inputMode="tel" maxLength={15} placeholder="Enter personal phone number" value={form.personalPhone} onChange={(e) => setForm({ ...form, personalPhone: sanitizePhone(e.target.value) })} className={inputCls} />
                  </IconInput>
                </Field>
                <Field label="Work Phone">
                  <IconInput icon={<Phone size={14} />}>
                    <input inputMode="tel" maxLength={15} placeholder="Enter work phone number" value={form.workPhone} onChange={(e) => setForm({ ...form, workPhone: sanitizePhone(e.target.value) })} className={inputCls} />
                  </IconInput>
                </Field>
              </div>
            </Section>

            <Section
              id="emergency"
              icon={<ShieldAlert size={18} />}
              title="Emergency Contact"
              subtitle="Person to reach in case of emergency. At least one recommended."
              sectionRef={(el) => { sectionRefs.current.emergency = el; }}
            >
              <div className="space-y-4">
                {form.emergencyContacts.map((c, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-4 bg-gray-50/40 relative">
                    {form.emergencyContacts.length > 1 && (
                      <button type="button" onClick={() => removeEmergencyContact(i)}
                        className="absolute top-2 right-2 text-gray-400 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    )}
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-3">
                      {i === 0 ? "Primary contact" : `Contact ${i + 1}`}
                    </div>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                      <Field label="Name" required>
                        <input placeholder="Full name" value={c.name} onChange={(e) => updateEmergencyContact(i, "name", e.target.value)} className={inputCls} />
                      </Field>
                      <Field label="Relationship" required>
                        <Select
                          value={c.relationship}
                          onChange={(v) => updateEmergencyContact(i, "relationship", v)}
                          placeholder="Select"
                          options={RELATIONS.map((r) => ({ value: r, label: r }))}
                        />
                      </Field>
                      <Field label="Contact Number" required>
                        <IconInput icon={<Phone size={14} />}>
                          <input inputMode="tel" maxLength={15} placeholder="+91 9XXXXXXXXX" value={c.phone} onChange={(e) => updateEmergencyContact(i, "phone", sanitizePhone(e.target.value))} className={inputCls} />
                        </IconInput>
                      </Field>
                      <Field label="Email">
                        <IconInput icon={<Mail size={14} />}>
                          <input type="email" placeholder="optional" value={c.email} onChange={(e) => updateEmergencyContact(i, "email", e.target.value)} className={inputCls} />
                        </IconInput>
                      </Field>
                      <div className="col-span-2">
                        <Field label="Address">
                          <textarea rows={2} placeholder="Full address" value={c.address} onChange={(e) => updateEmergencyContact(i, "address", e.target.value)} className={inputCls} />
                        </Field>
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addEmergencyContact}
                  className="flex items-center gap-1.5 text-sm text-[#3b82f6] hover:underline">
                  <Plus size={14} /> Add another contact
                </button>
              </div>
            </Section>

            <Section
              id="address"
              icon={<MapPin size={18} />}
              title="Address *"
              subtitle="Present address mandatory; permanent optional."
              sectionRef={(el) => { sectionRefs.current.address = el; }}
            >
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-2">Present address</p>
                  <AddressBlock value={form.currentAddress} onChange={(key, v) => updateAddress("currentAddress", key, v)} />
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-800">Permanent address</p>
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      <input type="checkbox" checked={form.sameAsPresent}
                        onChange={(e) => setForm({ ...form, sameAsPresent: e.target.checked })} />
                      Same as Present address
                    </label>
                  </div>
                  {!form.sameAsPresent && (
                    <AddressBlock value={form.permanentAddress} onChange={(key, v) => updateAddress("permanentAddress", key, v)} />
                  )}
                </div>
              </div>
            </Section>

            <Section
              id="employment"
              icon={<Briefcase size={18} />}
              title="Employment"
              subtitle="Job and employment related information."
              sectionRef={(el) => { sectionRefs.current.employment = el; }}
            >
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <Field label="Job Title" required>
                  <IconInput icon={<Briefcase size={14} />}>
                    <input placeholder="Enter job title" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} className={inputCls} />
                  </IconInput>
                </Field>
                <Field label="Designation" required>
                  <Select
                    value={form.designationId}
                    onChange={(v) => setForm({ ...form, designationId: v })}
                    placeholder="Select designation"
                    searchable
                    options={(desigs?.data ?? []).map((d) => ({ value: d.id, label: d.title }))}
                  />
                </Field>
                <Field label="Department" required>
                  <Select
                    value={form.departmentId}
                    onChange={(v) => setForm({ ...form, departmentId: v })}
                    placeholder="Select department"
                    searchable
                    options={(depts?.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
                  />
                </Field>
                <Field label="Office Location" required>
                  <Select
                    value={form.officeLocationId}
                    onChange={(v) => setForm({ ...form, officeLocationId: v })}
                    placeholder="Select location"
                    searchable
                    options={(locs?.data ?? []).map((l) => ({ value: l.id, label: l.name }))}
                  />
                </Field>
                <Field label="Reporting Manager" required>
                  <Select
                    value={form.reportingManagerId}
                    onChange={(v) => setForm({ ...form, reportingManagerId: v })}
                    placeholder="Search manager"
                    searchable
                    options={(managers?.data ?? []).map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` }))}
                  />
                </Field>
                <Field label="Role" required>
                  <Select
                    value={form.roleId}
                    onChange={(v) => setForm({ ...form, roleId: v })}
                    placeholder="Select role (controls permissions)"
                    searchable
                    options={(roles?.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
                  />
                </Field>
                <Field label="Salary Template" required>
                  <Select
                    value={form.salaryTemplateId}
                    onChange={(v) => setForm({ ...form, salaryTemplateId: v })}
                    placeholder="Select template"
                    searchable
                    options={(salaryTemplates?.data ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
                  />
                </Field>
                <Field label="CTC (LPA)" required>
                  <NumberInput
                    min={0}
                    value={form.ctcLpa}
                    onChange={(v) => setForm({ ...form, ctcLpa: v })}
                    placeholder="e.g. 12.5"
                    className={inputCls}
                  />
                </Field>
                <Field label="Date of Joining" required>
                  <input type="date" required value={form.dateOfJoining} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Employment Type" required>
                  <Select
                    value={form.employmentType}
                    onChange={(v) => setForm({ ...form, employmentType: v as EmploymentType })}
                    options={EMP_TYPES.map((t) => ({ value: t, label: t === "FullTime" ? "Full Time" : t === "PartTime" ? "Part Time" : t }))}
                  />
                </Field>
                <Field label="Work Location Type" required>
                  <Select
                    value={form.workLocation}
                    onChange={(v) => setForm({ ...form, workLocation: v as WorkLocation })}
                    options={WORK_LOCS.map((w) => ({ value: w, label: w }))}
                  />
                </Field>
                <Field label="Notice Period (days)">
                  <NumberInput allowDecimal={false} value={form.noticePeriodDays} onChange={(v) => setForm({ ...form, noticePeriodDays: v })} className={inputCls} />
                </Field>
                <Field label="Previous Experience (months)">
                  <NumberInput allowDecimal={false} value={form.previousExperience} onChange={(v) => setForm({ ...form, previousExperience: v })} className={inputCls} />
                </Field>
                <Field label="Status" required>
                  <Select
                    value={form.status}
                    onChange={(v) => setForm({ ...form, status: v as EmployeeStatus })}
                    options={[
                      { value: "Active", label: "Active" },
                      { value: "PreBoarding", label: "Pre-Boarding" },
                    ]}
                  />
                </Field>
              </div>
            </Section>

            <Section
              id="education"
              icon={<GraduationCap size={18} />}
              title="Education *"
              subtitle="At least one entry with school + degree required."
              sectionRef={(el) => { sectionRefs.current.education = el; }}
              action={
                <button type="button" onClick={addEducation} className="inline-flex items-center gap-1 text-xs font-semibold text-[#16243A] hover:underline">
                  <Plus size={12} /> Add Row
                </button>
              }
            >
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/60 text-[10px] uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="text-left px-2 py-2 font-bold">Institution</th>
                      <th className="text-left px-2 py-2 font-bold">Degree</th>
                      <th className="text-left px-2 py-2 font-bold">Field of Study</th>
                      <th className="text-left px-2 py-2 font-bold">Start Year</th>
                      <th className="text-left px-2 py-2 font-bold">End Year</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {form.educations.map((e, i) => (
                      <tr key={i}>
                        <td className="px-1 py-2"><FormInput value={e.institution} onChange={(ev) => updateEducation(i, "institution", ev.target.value)} /></td>
                        <td className="px-1 py-2"><FormInput value={e.degree} onChange={(ev) => updateEducation(i, "degree", ev.target.value)} /></td>
                        <td className="px-1 py-2"><FormInput value={e.fieldOfStudy} onChange={(ev) => updateEducation(i, "fieldOfStudy", ev.target.value)} /></td>
                        <td className="px-1 py-2"><FormInput type="number" inputMode="numeric" placeholder="2018" value={e.startYear} onChange={(ev) => updateEducation(i, "startYear", ev.target.value)} /></td>
                        <td className="px-1 py-2"><FormInput type="number" inputMode="numeric" placeholder="2022" value={e.endYear} onChange={(ev) => updateEducation(i, "endYear", ev.target.value)} /></td>
                        <td className="px-1 py-2 text-center">
                          {form.educations.length > 1 && (
                            <button type="button" onClick={() => removeEducation(i)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section
              id="experience"
              icon={<History size={18} />}
              title="Career History (Topgrading)"
              subtitle="For each role capture accomplishments, compensation, reason for leaving and the boss appraisal."
              sectionRef={(el) => { sectionRefs.current.experience = el; }}
              action={
                <button type="button" onClick={addExperience} className="inline-flex items-center gap-1 text-xs font-semibold text-[#16243A] hover:underline">
                  <Plus size={12} /> Add Row
                </button>
              }
            >
              <div className="space-y-4">
                {form.pastExperiences.map((e, i) => (
                  <ExperienceCard
                    key={i}
                    index={i}
                    exp={e}
                    canRemove={form.pastExperiences.length > 1}
                    onChange={(key, v) => updateExperience(i, key, v)}
                    onRemove={() => removeExperience(i)}
                  />
                ))}
                <button type="button" onClick={addExperience} className="flex items-center gap-1.5 text-sm text-[#3b82f6] hover:underline">
                  <Plus size={14} /> Add another role
                </button>
              </div>
            </Section>

            <Section
              id="family"
              icon={<Users size={18} />}
              title="Family Details"
              subtitle="Spouse, children, parents and dependents."
              sectionRef={(el) => { sectionRefs.current.family = el; }}
              action={
                <button type="button" onClick={addFamilyMember} className="inline-flex items-center gap-1 text-xs font-semibold text-[#16243A] hover:underline">
                  <Plus size={12} /> Add Row
                </button>
              }
            >
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/60 text-[10px] uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="text-left px-2 py-2 font-bold">Name</th>
                      <th className="text-left px-2 py-2 font-bold">Relation</th>
                      <th className="text-left px-2 py-2 font-bold">Date of Birth</th>
                      <th className="text-left px-2 py-2 font-bold">Occupation</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {form.familyMembers.map((m, i) => (
                      <tr key={i}>
                        <td className="px-1 py-2"><FormInput value={m.name} onChange={(ev) => updateFamilyMember(i, "name", ev.target.value)} /></td>
                        <td className="px-1 py-2">
                          <select
                            value={m.relation}
                            onChange={(ev) => updateFamilyMember(i, "relation", ev.target.value)}
                            className="w-full border border-[var(--border)] rounded px-2 py-1.5 text-sm bg-white"
                          >
                            <option value="">Select</option>
                            {FAMILY_RELATIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </td>
                        <td className="px-1 py-2"><FormInput type="date" value={m.dob} onChange={(ev) => updateFamilyMember(i, "dob", ev.target.value)} /></td>
                        <td className="px-1 py-2"><FormInput value={m.occupation} onChange={(ev) => updateFamilyMember(i, "occupation", ev.target.value)} /></td>
                        <td className="px-1 py-2 text-center">
                          {form.familyMembers.length > 1 && (
                            <button type="button" onClick={() => removeFamilyMember(i)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section
              id="certifications"
              icon={<Award size={18} />}
              title="Certifications"
              subtitle="Professional courses, certificates and credentials."
              sectionRef={(el) => { sectionRefs.current.certifications = el; }}
              action={
                <button type="button" onClick={addCertification} className="inline-flex items-center gap-1 text-xs font-semibold text-[#16243A] hover:underline">
                  <Plus size={12} /> Add Row
                </button>
              }
            >
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/60 text-[10px] uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="text-left px-2 py-2 font-bold">Name</th>
                      <th className="text-left px-2 py-2 font-bold">Course Name</th>
                      <th className="text-left px-2 py-2 font-bold">Issuing Authority</th>
                      <th className="text-left px-2 py-2 font-bold">Year</th>
                      <th className="text-left px-2 py-2 font-bold">Expiry</th>
                      <th className="text-left px-2 py-2 font-bold">Credential URL</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {form.certifications.map((c, i) => (
                      <tr key={i}>
                        <td className="px-1 py-2"><FormInput value={c.name} onChange={(ev) => updateCertification(i, "name", ev.target.value)} placeholder="AWS SAA" /></td>
                        <td className="px-1 py-2"><FormInput value={c.courseName} onChange={(ev) => updateCertification(i, "courseName", ev.target.value)} placeholder="Solutions Architect" /></td>
                        <td className="px-1 py-2"><FormInput value={c.issuingAuthority} onChange={(ev) => updateCertification(i, "issuingAuthority", ev.target.value)} placeholder="Amazon" /></td>
                        <td className="px-1 py-2"><FormInput inputMode="numeric" maxLength={4} value={c.year} onChange={(ev) => updateCertification(i, "year", ev.target.value.replace(/\D/g, ""))} placeholder="2024" /></td>
                        <td className="px-1 py-2"><FormInput type="date" value={c.expiryDate} onChange={(ev) => updateCertification(i, "expiryDate", ev.target.value)} /></td>
                        <td className="px-1 py-2"><FormInput value={c.credentialUrl} onChange={(ev) => updateCertification(i, "credentialUrl", ev.target.value)} placeholder="https://..." /></td>
                        <td className="px-1 py-2 text-center">
                          {form.certifications.length > 1 && (
                            <button type="button" onClick={() => removeCertification(i)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section
              id="identity"
              icon={<ShieldCheck size={18} />}
              title="Identity *"
              subtitle="PAN and Aadhaar mandatory."
              sectionRef={(el) => { sectionRefs.current.identity = el; }}
            >
              <div className="grid grid-cols-2 gap-x-5 gap-y-4">
                <Field label="PAN Number" required>
                  <IconInput icon={<IdCard size={14} />}>
                    <input required placeholder="Enter PAN number" value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase() })} className={`${inputCls} font-mono`} maxLength={10} />
                  </IconInput>
                </Field>
                <Field label="Aadhaar Number" required>
                  <IconInput icon={<IdCard size={14} />}>
                    <input required inputMode="numeric" placeholder="Enter Aadhaar number" value={form.aadhaarNumber} onChange={(e) => setForm({ ...form, aadhaarNumber: sanitizeDigits(e.target.value) })} className={`${inputCls} font-mono tracking-widest`} maxLength={12} />
                  </IconInput>
                </Field>
                <Field label="EPF Contribution Rate">
                  <Select
                    value={form.epfContributionRate}
                    onChange={(v) => setForm({ ...form, epfContributionRate: v as typeof form.epfContributionRate })}
                    options={[
                      { value: "", label: "Use org default" },
                      { value: "TwelvePercentRestricted", label: "12% Restricted (₹15k cap, ₹1,800 max)" },
                      { value: "TwelvePercentActual", label: "12% Actual (no cap)" },
                    ]}
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Per EPF Act, once Actual is selected, employee cannot revert to Restricted.
                  </p>
                </Field>
              </div>
            </Section>

            <Section
              id="bank"
              icon={<Banknote size={18} />}
              title="Bank Details *"
              subtitle="Bank name, account number and IFSC are mandatory."
              sectionRef={(el) => { sectionRefs.current.bank = el; }}
            >
              <BankDetailsFields
                value={{
                  bankName: form.bankName,
                  bankAccountNumber: form.bankAccountNumber,
                  bankIfsc: form.bankIfsc,
                  bankBranch: form.bankBranch,
                  bankAccountType: form.bankAccountType,
                }}
                onChange={(patch) => setForm({ ...form, ...patch })}
                inputCls={inputCls}
              />
            </Section>

            <Section
              id="review"
              icon={<ClipboardCheck size={18} />}
              title="Review"
              subtitle="Review information before creating the employee."
              sectionRef={(el) => { sectionRefs.current.review = el; }}
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

        <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-3 flex items-center gap-2 z-10">
          <button type="submit" disabled={createMut.isPending} className="btn btn-primary">
            <Save size={14} /> {createMut.isPending ? "Saving..." : "Create Employee"}
          </button>
          <Link href="/org-chart" className="btn btn-secondary">Cancel</Link>
        </div>
      </form>

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#16243A]/5 text-[#16243A] flex items-center justify-center shrink-0">
                <Mail size={18} />
              </div>
              <div>
                <h2 className="font-bold text-gray-900">Send portal invite?</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Email <span className="font-medium text-gray-700">{form.workEmail || "this employee"}</span> a link to set their password and access the portal. Choose <span className="font-medium">Create without invite</span> to add them now and invite later.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 mt-5">
              <button type="button" disabled={createMut.isPending} onClick={() => confirmCreate(true)} className="btn btn-primary justify-center">
                <Mail size={14} /> {createMut.isPending ? "Creating..." : "Create & send invite"}
              </button>
              <button type="button" disabled={createMut.isPending} onClick={() => confirmCreate(false)} className="btn btn-secondary justify-center">
                Create without invite
              </button>
              <button type="button" disabled={createMut.isPending} onClick={() => setInviteOpen(false)} className="text-sm text-gray-500 hover:text-gray-700 mt-1">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#16243A] focus:border-[#16243A]";

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
  id, icon, title, subtitle, children, sectionRef, action,
}: {
  id: StepId;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  sectionRef: (el: HTMLElement | null) => void;
  action?: React.ReactNode;
}) {
  return (
    <section ref={sectionRef} data-step-id={id} className="surface-card p-5">
      <div className="flex items-start gap-2.5 mb-4 pb-4 border-b border-gray-100">
        <div className="w-9 h-9 rounded-xl bg-[#16243A]/5 text-[#16243A] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-gray-900 leading-tight">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function AddressBlock({
  value, onChange,
}: {
  value: Address;
  onChange: (key: keyof Address, v: string) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-3">
      <div className="col-span-3">
        <FormInput placeholder="Address line 1" value={value.line1} onChange={(e) => onChange("line1", e.target.value)} />
      </div>
      <div className="col-span-3">
        <FormInput placeholder="Address line 2" value={value.line2} onChange={(e) => onChange("line2", e.target.value)} />
      </div>
      <div className="col-span-2">
        <FormInput placeholder="City" value={value.city} onChange={(e) => onChange("city", e.target.value)} />
      </div>
      <div className="col-span-2">
        <Select value={value.country} onChange={(v) => onChange("country", v)} placeholder="Country" options={COUNTRY_OPTS} />
      </div>
      <div className="col-span-2">
        <Select value={value.state} onChange={(v) => onChange("state", v)} placeholder="State" options={STATE_OPTS} />
      </div>
      <div className="col-span-2">
        <FormInput placeholder="Postal Code" value={value.postalCode} onChange={(e) => onChange("postalCode", e.target.value)} />
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-800 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

// Topgrading career-history card — one expandable role with structured depth.
function ExperienceCard({ index, exp, canRemove, onChange, onRemove }: {
  index: number;
  exp: Experience;
  canRemove: boolean;
  onChange: (key: keyof Experience, v: string | boolean) => void;
  onRemove: () => void;
}) {
  const ta = `${inputCls} min-h-[60px] resize-y`;
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/40 relative">
      {canRemove && (
        <button type="button" onClick={onRemove} className="absolute top-2 right-2 text-gray-400 hover:text-red-500" aria-label="Remove role">
          <Trash2 size={14} />
        </button>
      )}
      <div className="text-xs font-semibold text-gray-500 uppercase mb-3">
        {index === 0 ? "Most recent role" : `Role ${index + 1}`}
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-4">
        <Field label="Company"><input value={exp.company} onChange={(e) => onChange("company", e.target.value)} placeholder="Company name" className={inputCls} /></Field>
        <Field label="Title / Position"><input value={exp.designation} onChange={(e) => onChange("designation", e.target.value)} placeholder="e.g. Senior Engineer" className={inputCls} /></Field>

        <Field label="From"><input type="month" value={exp.startDate} onChange={(e) => onChange("startDate", e.target.value)} className={inputCls} /></Field>
        <Field label="To">
          <input type="month" value={exp.endDate} disabled={exp.currentlyWorkHere} onChange={(e) => onChange("endDate", e.target.value)} className={clsx(inputCls, exp.currentlyWorkHere && "opacity-50")} />
          <label className="mt-1.5 flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={exp.currentlyWorkHere} onChange={(e) => onChange("currentlyWorkHere", e.target.checked)} className="rounded text-[#3b82f6]" />
            I currently work here
          </label>
        </Field>

        <Field label="Starting Compensation"><input value={exp.startCompensation} onChange={(e) => onChange("startCompensation", e.target.value)} placeholder="e.g. ₹8 LPA" className={inputCls} /></Field>
        <Field label="Ending Compensation"><input value={exp.endCompensation} onChange={(e) => onChange("endCompensation", e.target.value)} placeholder="e.g. ₹14 LPA" className={inputCls} /></Field>
      </div>

      <div className="mt-4 space-y-3">
        <Field label="Key Responsibilities"><textarea value={exp.responsibilities} onChange={(e) => onChange("responsibilities", e.target.value)} rows={2} placeholder="What you owned in this role" className={ta} /></Field>
        <Field label="Key Accomplishments"><textarea value={exp.accomplishments} onChange={(e) => onChange("accomplishments", e.target.value)} rows={2} placeholder="Biggest wins, measurable results" className={ta} /></Field>
        <Field label="Challenges / Lessons Learned"><textarea value={exp.challenges} onChange={(e) => onChange("challenges", e.target.value)} rows={2} placeholder="Mistakes made and what you learned" className={ta} /></Field>
        <Field label="Reason for Leaving"><textarea value={exp.reasonForLeaving} onChange={(e) => onChange("reasonForLeaving", e.target.value)} rows={2} placeholder="Why you moved on" className={ta} /></Field>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-4 mt-4">
        <Field label="Supervisor Name"><input value={exp.supervisorName} onChange={(e) => onChange("supervisorName", e.target.value)} placeholder="Manager's name" className={inputCls} /></Field>
        <Field label="Supervisor Title"><input value={exp.supervisorTitle} onChange={(e) => onChange("supervisorTitle", e.target.value)} placeholder="Manager's title" className={inputCls} /></Field>
      </div>

      <div className="mt-4 rounded-lg ring-1 ring-[#16243A]/10 bg-[#16243A]/[0.03] p-3">
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2">
          What would your supervisor say? <span className="font-medium text-gray-400 normal-case">(reference check)</span>
        </p>
        <div className="grid grid-cols-2 gap-x-5 gap-y-4">
          <Field label="Strengths they'd cite"><textarea value={exp.bossStrengths} onChange={(e) => onChange("bossStrengths", e.target.value)} rows={2} className={ta} /></Field>
          <Field label="Weaker points they'd cite"><textarea value={exp.bossWeaknesses} onChange={(e) => onChange("bossWeaknesses", e.target.value)} rows={2} className={ta} /></Field>
        </div>
      </div>
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

function StatutoryToggle({ label, checked, onChange, hint }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint: string;
}) {
  return (
    <div className={`rounded-lg ring-1 p-3 transition ${checked ? "ring-emerald-200 bg-emerald-50/40" : "ring-amber-200 bg-amber-50/40"}`}>
      <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded text-[#3b82f6]"
        />
        {label}
        <span className={`ml-auto text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${checked ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
          {checked ? "Default" : "Excluded"}
        </span>
      </label>
      <p className="text-[11px] text-gray-500 mt-1 leading-snug">{hint}</p>
    </div>
  );
}
