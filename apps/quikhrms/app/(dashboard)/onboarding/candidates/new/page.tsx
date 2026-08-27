"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useApiClient, ApiError } from "@/lib/hooks/use-api";
import { useDepartments, useDesignations, useLocations, useRoles, useSalaryTemplates } from "@/lib/hooks/use-ref-data";
import { useToast } from "@/components/hrms/toast";
import {
  X, Upload, Plus, Trash2, UserPlus,
  User, IdCard, MapPin, Briefcase, GraduationCap, History, Sparkles, Save, Check, ShieldAlert,
  Users, Award, ArrowLeft, ArrowRight,
} from "lucide-react";
import { clsx } from "clsx";
import { Select } from "@/components/hrms/select";
import { Select as UiSelect } from "@/components/hrms/ui/select";
import { FormField, FormInput, FormTextarea, FormCheckbox } from "@/components/hrms/form";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { PageBackground } from "@/components/hrms/page-background";
import { todayInput } from "@/lib/utils/date-input";
import { INDIA_STATE_OPTS as STATE_OPTS } from "@/lib/data/india-states";

type SourceOfHire = "Referral" | "JobPortal" | "LinkedIn" | "Agency" | "Campus" | "Direct" | "Other";

interface Department { id: string; name: string; }
interface Designation { id: string; title: string; }
interface Location { id: string; name: string; }
interface Manager { id: string; firstName: string; lastName: string; employeeCode?: string | null; }
interface Role { id: string; code: string; name: string; }
interface SalaryTemplate { id: string; name: string; code: string; }

interface Education { schoolName: string; degree: string; fieldOfStudy: string; completionDate: string; notes: string; }
interface Experience { occupation: string; company: string; summary: string; duration: string; currentlyWorkHere: boolean; }
interface Address { line1: string; line2: string; city: string; country: string; state: string; postalCode: string; }
interface EmergencyContact { name: string; relationship: string; phone: string; email: string; address: string; }
interface FamilyMember { name: string; relation: string; dob: string; occupation: string; }
interface Certification { name: string; courseName: string; issuingAuthority: string; year: string; expiryDate: string; credentialUrl: string; }

const emptyEducation: Education = { schoolName: "", degree: "", fieldOfStudy: "", completionDate: "", notes: "" };
const emptyExperience: Experience = { occupation: "", company: "", summary: "", duration: "", currentlyWorkHere: false };
const emptyAddress: Address = { line1: "", line2: "", city: "", country: "", state: "", postalCode: "" };
const emptyEmergencyContact: EmergencyContact = { name: "", relationship: "", phone: "", email: "", address: "" };
const emptyFamilyMember: FamilyMember = { name: "", relation: "", dob: "", occupation: "" };
const emptyCertification: Certification = { name: "", courseName: "", issuingAuthority: "", year: "", expiryDate: "", credentialUrl: "" };

const FAMILY_RELATIONS = ["Spouse", "Father", "Mother", "Son", "Daughter", "Brother", "Sister", "Father-in-law", "Mother-in-law", "Other"];

const RELATIONS = ["Spouse", "Parent", "Sibling", "Child", "Friend", "Relative", "Other"];

const SOURCES: SourceOfHire[] = ["Referral", "JobPortal", "LinkedIn", "Agency", "Campus", "Direct", "Other"];

const COUNTRY_OPTS = [
  { value: "IN", label: "India" },
  { value: "US", label: "United States" },
  { value: "UK", label: "United Kingdom" },
];

const STEPS = [
  { id: "personal",     num: 1, title: "Personal Details", subtitle: "Basic contact information", icon: <User size={16} /> },
  { id: "identity",     num: 2, title: "Identity",         subtitle: "KYC details",                icon: <IdCard size={16} /> },
  { id: "address",      num: 3, title: "Address",          subtitle: "Present & permanent",        icon: <MapPin size={16} /> },
  { id: "emergency",    num: 4, title: "Emergency Contact", subtitle: "Next of kin / SOS",         icon: <ShieldAlert size={16} /> },
  { id: "professional", num: 5, title: "Professional",     subtitle: "Job & qualifications",       icon: <Briefcase size={16} /> },
  { id: "education",    num: 6, title: "Education",        subtitle: "Academic history",           icon: <GraduationCap size={16} /> },
  { id: "experience",   num: 7, title: "Experience",       subtitle: "Past roles",                 icon: <History size={16} /> },
  { id: "family",         num: 8, title: "Family Details",  subtitle: "Dependents & relatives",    icon: <Users size={16} /> },
  { id: "certifications", num: 9, title: "Certifications",  subtitle: "Courses & credentials",     icon: <Award size={16} /> },
] as const;

type StepId = typeof STEPS[number]["id"];

export default function NewCandidatePage() {
  const api = useApiClient();
  const router = useRouter();
  const toast = useToast();

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const offerLetterInputRef = useRef<HTMLInputElement | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [offerLetterUploading, setOfferLetterUploading] = useState(false);

  const uploadFile = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.upload<{ url: string }>("/api/v1/hrms/uploads", fd);
      return res.data.url;
    } catch (e) {
      toast.error("Upload failed", e instanceof Error ? e.message : "Try again");
      return null;
    }
  };

  const [form, setForm] = useState({
    workEmail: "", personalEmail: "", phoneCode: "+91", personalPhone: "",
    firstName: "", lastName: "",
    uanNumber: "", aadhaarNumber: "", panNumber: "", profilePhoto: "",
    currentAddress: { ...emptyAddress },
    permanentAddress: { ...emptyAddress },
    sameAsPresent: false,
    previousExperience: null as number | null,
    sourceOfHire: "" as SourceOfHire | "",
    skillSet: "",
    highestQualification: "",
    additionalInfo: "",
    officeLocationId: "",
    jobTitle: "",
    designationId: "",
    currentSalary: null as number | null,
    departmentId: "",
    reportingManagerId: "",
    roleId: "",
    salaryTemplateId: "",
    ctcLpa: null as number | null,
    offerLetterUrl: "",
    tentativeJoiningDate: "",
    dateOfJoining: "",
    templateId: "",
    educations: [{ ...emptyEducation }] as Education[],
    pastExperiences: [{ ...emptyExperience }] as Experience[],
    emergencyContacts: [{ ...emptyEmergencyContact }] as EmergencyContact[],
    familyMembers: [{ ...emptyFamilyMember }] as FamilyMember[],
    certifications: [{ ...emptyCertification }] as Certification[],
  });

  const [activeStep, setActiveStep] = useState<StepId>("personal");
  const scrollRef = useRef<HTMLDivElement>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === activeStep);
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === STEPS.length - 1;

  // Stepper navigation. Only the active step's section is shown; scroll the
  // panel back to the top on each change so long sections start at the header.
  const goToStep = (id: StepId) => {
    setActiveStep(id);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };
  const nextStep = () => { if (!isLastStep) goToStep(STEPS[stepIndex + 1].id); };
  const prevStep = () => { if (!isFirstStep) goToStep(STEPS[stepIndex - 1].id); };

  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();
  const { data: locs } = useLocations();
  const { data: managers } = useQuery({ queryKey: ["employees-mgrs"], queryFn: () => api.get<Manager[]>("/api/v1/hrms/employees?limit=1000&picker=1") });
  const { data: roles } = useRoles();
  const { data: salaryTemplates } = useSalaryTemplates();
  const { data: templates } = useQuery({ queryKey: ["onboarding-templates"], queryFn: () => api.get<{ id: string; name: string; tasks: unknown[] }[]>("/api/v1/hrms/onboarding/templates?isActive=true&limit=50") });

  const submitMut = useMutation({
    // The submit handler catches and shows an ApiError-aware toast (with details),
    // so suppress the global modal to avoid a double popup.
    meta: { suppressGlobalError: true },
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/onboarding/candidates", body),
  });

  const handleSubmit = async (mode: "submit" | "submit-new" | "draft") => {
    const joining = form.dateOfJoining || form.tentativeJoiningDate;
    if (!joining && mode !== "draft") {
      toast.warning("Joining date required", "Please pick a tentative joining date or save as draft.");
      return;
    }
    // Phone — strict 10-digit validation. For +91, must also start with 6-9
    // (Indian mobile range). Non-draft only — drafts can be partial.
    if (mode !== "draft") {
      const digits = form.personalPhone.replace(/\D/g, "");
      if (!digits) {
        toast.warning("Phone required", "Please enter the candidate's 10-digit mobile number.");
        return;
      }
      if (digits.length !== 10) {
        toast.warning("Invalid phone", "Mobile number must be exactly 10 digits.");
        return;
      }
      if (form.phoneCode === "+91" && !/^[6-9]/.test(digits)) {
        toast.warning("Invalid Indian mobile", "Indian mobile numbers must start with 6, 7, 8, or 9.");
        return;
      }
      // Emergency contacts: any row the user started filling must have a
      // valid 10-digit phone. Empty rows are silently dropped on submit.
      for (let i = 0; i < form.emergencyContacts.length; i++) {
        const c = form.emergencyContacts[i];
        const started = !!(c.name || c.relationship || c.phone || c.email || c.address);
        if (!started) continue;
        const digits = c.phone.replace(/\D/g, "");
        if (digits.length !== 10) {
          toast.warning(`Emergency contact #${i + 1}`, "Phone must be exactly 10 digits.");
          return;
        }
      }
    }
    if (mode !== "draft") {
      if (!form.reportingManagerId) {
        toast.warning("Reporting Manager required", "Pick a manager in Professional step.");
        return;
      }
      if (!form.roleId) {
        toast.warning("Role required", "Pick a role in Professional step.");
        return;
      }
      if (!form.salaryTemplateId) {
        toast.warning("Salary template required", "Pick a template in Professional step.");
        return;
      }
      if (form.ctcLpa == null || form.ctcLpa <= 0) {
        toast.warning("CTC (LPA) required", "Enter annual CTC in lakhs in Professional step.");
        return;
      }
      if (!form.templateId) {
        toast.warning("Onboarding template required", "Pick an onboarding template in the Professional step (or save as draft).");
        return;
      }
    }

    const profilePhoto = isValidUrl(form.profilePhoto) ? form.profilePhoto : undefined;
    const offerLetterUrl = isValidUrl(form.offerLetterUrl) ? form.offerLetterUrl : undefined;

    const payload = {
      firstName: form.firstName,
      lastName: form.lastName,
      workEmail: form.workEmail,
      personalEmail: form.personalEmail || undefined,
      personalPhone: form.personalPhone ? `${form.phoneCode}${form.personalPhone}` : undefined,
      profilePhoto,
      panNumber: form.panNumber || undefined,
      aadhaarNumber: form.aadhaarNumber || undefined,
      uanNumber: form.uanNumber || undefined,
      currentAddress: hasAddress(form.currentAddress) ? form.currentAddress : undefined,
      permanentAddress: form.sameAsPresent ? undefined : (hasAddress(form.permanentAddress) ? form.permanentAddress : undefined),
      sameAsPresent: form.sameAsPresent,
      previousExperience: form.previousExperience || undefined,
      sourceOfHire: form.sourceOfHire || undefined,
      skillSet: form.skillSet || undefined,
      highestQualification: form.highestQualification || undefined,
      additionalInfo: form.additionalInfo || undefined,
      officeLocationId: form.officeLocationId || undefined,
      jobTitle: form.jobTitle || undefined,
      currentSalary: form.currentSalary || undefined,
      departmentId: form.departmentId || undefined,
      reportingManagerId: form.reportingManagerId || undefined,
      roleId: form.roleId || undefined,
      salaryTemplateId: form.salaryTemplateId || undefined,
      ctcLpa: form.ctcLpa ?? undefined,
      offerLetterUrl,
      tentativeJoiningDate: form.tentativeJoiningDate || undefined,
      dateOfJoining: joining || new Date().toISOString().slice(0, 10),
      educations: form.educations.filter((e) => e.schoolName || e.degree),
      pastExperiences: form.pastExperiences.filter((e) => e.company || e.occupation),
      emergencyContacts: form.emergencyContacts
        .filter((c) => c.name && c.relationship && c.phone)
        .map((c) => ({
          name: c.name,
          relationship: c.relationship,
          phone: c.phone,
          email: c.email || undefined,
          address: c.address || undefined,
        })),
      familyMembers: form.familyMembers
        .filter((m) => m.name && m.relation)
        .map((m) => ({
          name: m.name,
          relation: m.relation,
          dob: m.dob || undefined,
          occupation: m.occupation || undefined,
        })),
      certifications: form.certifications
        .filter((c) => c.name)
        .map((c) => ({
          name: c.name,
          courseName: c.courseName || undefined,
          issuingAuthority: c.issuingAuthority || undefined,
          year: c.year || undefined,
          expiryDate: c.expiryDate || undefined,
          credentialUrl: c.credentialUrl || undefined,
        })),
      templateId: form.templateId || undefined,
      saveDraft: mode === "draft",
    };

    try {
      await submitMut.mutateAsync(payload);
      toast.success(
        mode === "draft" ? "Draft saved" : "Candidate added",
        `${form.firstName} ${form.lastName} — ${form.workEmail}`,
      );
      if (mode === "submit-new") {
        setForm((f) => ({ ...f, firstName: "", lastName: "", workEmail: "", personalEmail: "", personalPhone: "", panNumber: "", aadhaarNumber: "", uanNumber: "" }));
        goToStep("personal");
      } else {
        router.push("/onboarding");
      }
    } catch (e) {
      if (e instanceof ApiError) {
        toast.error(e.message || "Failed to save candidate", `Status ${e.status} · ${e.code}`, e.details as Record<string, string[]> | null);
      } else {
        toast.error("Unexpected error", e instanceof Error ? e.message : "Please try again.");
      }
    }
  };

  const updateAddress = (field: "currentAddress" | "permanentAddress", key: keyof Address, value: string) => {
    setForm({ ...form, [field]: { ...form[field], [key]: value } });
  };

  const addEducation = () => setForm({ ...form, educations: [...form.educations, { ...emptyEducation }] });
  const removeEducation = (i: number) => setForm({ ...form, educations: form.educations.filter((_, idx) => idx !== i) });
  const updateEducation = (i: number, key: keyof Education, v: string) =>
    setForm({ ...form, educations: form.educations.map((e, idx) => idx === i ? { ...e, [key]: v } : e) });

  const addExperience = () => setForm({ ...form, pastExperiences: [...form.pastExperiences, { ...emptyExperience }] });
  const removeExperience = (i: number) => setForm({ ...form, pastExperiences: form.pastExperiences.filter((_, idx) => idx !== i) });
  const updateExperience = (i: number, key: keyof Experience, v: string | boolean) =>
    setForm({ ...form, pastExperiences: form.pastExperiences.map((e, idx) => idx === i ? { ...e, [key]: v } : e) });

  const addEmergencyContact = () => setForm({ ...form, emergencyContacts: [...form.emergencyContacts, { ...emptyEmergencyContact }] });
  const removeEmergencyContact = (i: number) => setForm({ ...form, emergencyContacts: form.emergencyContacts.filter((_, idx) => idx !== i) });
  const updateEmergencyContact = (i: number, key: keyof EmergencyContact, v: string) =>
    setForm({ ...form, emergencyContacts: form.emergencyContacts.map((c, idx) => idx === i ? { ...c, [key]: v } : c) });

  const addFamilyMember = () => setForm({ ...form, familyMembers: [...form.familyMembers, { ...emptyFamilyMember }] });
  const removeFamilyMember = (i: number) => setForm({ ...form, familyMembers: form.familyMembers.filter((_, idx) => idx !== i) });
  const updateFamilyMember = (i: number, key: keyof FamilyMember, v: string) =>
    setForm({ ...form, familyMembers: form.familyMembers.map((m, idx) => idx === i ? { ...m, [key]: v } : m) });

  const addCertification = () => setForm({ ...form, certifications: [...form.certifications, { ...emptyCertification }] });
  const removeCertification = (i: number) => setForm({ ...form, certifications: form.certifications.filter((_, idx) => idx !== i) });
  const updateCertification = (i: number, key: keyof Certification, v: string) =>
    setForm({ ...form, certifications: form.certifications.map((c, idx) => idx === i ? { ...c, [key]: v } : c) });

  const designationOpts = (desigs?.data ?? []).map((d) => ({ value: d.id, label: d.title }));

  // Step actions (Save Draft / Back / Next / Submit). Rendered both at the end
  // of the active card and in the sticky bottom bar, so the user can advance
  // without scrolling down to the footer. Kept as a function (not a shared
  // element) so each render site gets its own instances.
  const renderStepButtons = () => (
    <>
      <button onClick={() => handleSubmit("draft")} disabled={submitMut.isPending} className="btn btn-secondary">
        Save Draft
      </button>
      {!isFirstStep && (
        <button type="button" onClick={prevStep} className="btn btn-secondary">
          <ArrowLeft size={14} /> Back
        </button>
      )}
      {!isLastStep ? (
        <button type="button" onClick={nextStep} className="btn btn-primary">
          Next <ArrowRight size={13} />
        </button>
      ) : (
        <>
          <button onClick={() => handleSubmit("submit-new")} disabled={submitMut.isPending} className="btn btn-secondary">
            Submit and New
          </button>
          <button onClick={() => handleSubmit("submit")} disabled={submitMut.isPending} className="btn btn-primary">
            <Save size={13} /> {submitMut.isPending ? "Saving..." : "Submit"}
          </button>
        </>
      )}
    </>
  );

  return (
    <div className="bg-gray-50 -m-6 min-h-screen flex flex-col">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <header className="bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-[#166534]/5 text-[#166534] flex items-center justify-center">
            <UserPlus size={18} />
          </div>
          <div>
            <h1 className="text-page-title text-gray-900 leading-tight">Add Candidate</h1>
            <p className="text-xs text-gray-500">Onboard a new candidate to the organisation.</p>
          </div>
        </div>
        <Link href="/onboarding" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <X size={18} />
        </Link>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-64 shrink-0 border-r border-gray-100 bg-[#faf4ef]/40 flex flex-col sticky top-[57px] self-start max-h-[calc(100vh-57px)] overflow-y-auto">
          <nav className="flex-1 p-4 space-y-1.5">
            {STEPS.map((s, idx) => {
              const active = activeStep === s.id;
              const passed = STEPS.findIndex((x) => x.id === activeStep) > idx;
              return (
                <button key={s.id} type="button" onClick={() => goToStep(s.id)}
                  className={clsx(
                    "w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition",
                    active ? "bg-white shadow-sm" : "hover:bg-white/60",
                  )}>
                  <div className={clsx(
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition",
                    active ? "bg-green-600 text-white"
                      : passed ? "bg-[#166534]/15 text-[#166534]"
                      : "border-2 border-gray-300 text-gray-500 bg-white",
                  )}>
                    {passed ? <Check size={14} /> : s.num}
                  </div>
                  <div className="min-w-0">
                    <p className={clsx("text-[13px] font-semibold leading-tight", active ? "text-[#166534]" : "text-gray-700")}>{s.title}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{s.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </nav>
          <div className="m-4 p-3 rounded-xl bg-[#166534]/5 border border-[#166534]/10">
            <div className="flex items-center gap-1.5 mb-1">
              <Sparkles size={13} className="text-[#166534]" />
              <span className="text-xs font-bold text-[#166534]">Tip</span>
            </div>
            <p className="text-[11px] text-gray-600 leading-snug">
              Complete details speed up onboarding and reduce back-and-forth.
            </p>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
            <div className="max-w-4xl mx-auto space-y-4 pb-5">
              <Section
                id="personal"
                icon={<User size={18} />}
                title="Personal Details"
                subtitle="Basic contact information of the candidate."
                active={activeStep === "personal"}
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <FormField label="First Name" required>
                    <FormInput placeholder="Enter first name" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
                  </FormField>
                  <FormField label="Last Name" required>
                    <FormInput placeholder="Enter last name" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
                  </FormField>
                  <FormField label="Email ID" required>
                    <FormInput type="email" placeholder="work.email@example.com" required value={form.workEmail} onChange={(e) => setForm({ ...form, workEmail: e.target.value })} />
                  </FormField>
                  <FormField label="Official Email">
                    <FormInput type="email" placeholder="personal.email@example.com" value={form.personalEmail} onChange={(e) => setForm({ ...form, personalEmail: e.target.value })} />
                  </FormField>
                  <FormField label="Phone" required>
                    <div className="flex items-stretch border border-[var(--border)] rounded-lg overflow-hidden bg-white focus-within:ring-1 focus-within:ring-[#166534] focus-within:border-[#166534]">
                      <Select value={form.phoneCode} onChange={(v) => setForm({ ...form, phoneCode: v })}
                        size="sm" className="min-w-[92px]"
                        options={[
                          { value: "+91", label: "🇮🇳 +91" },
                          { value: "+1", label: "🇺🇸 +1" },
                          { value: "+44", label: "🇬🇧 +44" },
                          { value: "+971", label: "🇦🇪 +971" },
                          { value: "+65", label: "🇸🇬 +65" },
                          { value: "+61", label: "🇦🇺 +61" },
                        ]} />
                      <input required type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength={10} placeholder="10-digit number"
                        value={form.personalPhone}
                        onChange={(e) => setForm({ ...form, personalPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                        className="flex-1 min-w-0 px-3 text-xs outline-none border-0" />
                    </div>
                  </FormField>
                  <FormField label="Photo" hint="JPG / PNG / GIF · 5 MB max">
                    <div className="flex items-center gap-2 border border-[var(--border)] rounded-lg px-3 py-2 bg-white">
                      <Upload size={14} className="text-gray-400 shrink-0" />
                      <input placeholder="Image URL or upload" value={form.profilePhoto}
                        onChange={(e) => setForm({ ...form, profilePhoto: e.target.value })}
                        className="flex-1 min-w-0 text-xs outline-none border-0 bg-transparent" />
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 5 * 1024 * 1024) { toast.error("File too large", "Max 5 MB"); return; }
                          setPhotoUploading(true);
                          const url = await uploadFile(file);
                          setPhotoUploading(false);
                          if (url) setForm((f) => ({ ...f, profilePhoto: url }));
                          e.target.value = "";
                        }}
                      />
                      <button
                        type="button"
                        disabled={photoUploading}
                        onClick={() => photoInputRef.current?.click()}
                        className="text-[#166534] text-xs font-semibold hover:underline shrink-0 disabled:opacity-60"
                      >
                        {photoUploading ? "Uploading…" : "Browse"}
                      </button>
                    </div>
                  </FormField>
                </div>
              </Section>

              <Section
                id="identity"
                icon={<IdCard size={18} />}
                title="Identity"
                subtitle="KYC and identity details."
                active={activeStep === "identity"}
              >
                <div className="grid grid-cols-3 gap-x-4 gap-y-4">
                  <FormField label="Aadhaar Number">
                    <FormInput inputMode="numeric" placeholder="12-digit Aadhaar" value={form.aadhaarNumber} onChange={(e) => setForm({ ...form, aadhaarNumber: e.target.value.replace(/\D/g, "").slice(0, 12) })} className="font-mono tracking-widest" maxLength={12} />
                  </FormField>
                  <FormField label="PAN Number">
                    <FormInput placeholder="ABCDE1234F" value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })} className="font-mono" maxLength={10} />
                  </FormField>
                  <FormField label="UAN Number">
                    <FormInput inputMode="numeric" placeholder="12-digit UAN" value={form.uanNumber} onChange={(e) => setForm({ ...form, uanNumber: e.target.value.replace(/\D/g, "").slice(0, 12) })} className="font-mono tracking-widest" maxLength={12} />
                  </FormField>
                </div>
              </Section>

              <Section
                id="address"
                icon={<MapPin size={18} />}
                title="Address"
                subtitle="Present and permanent address."
                active={activeStep === "address"}
              >
                <div className="space-y-4">
                  <div>
                    <p className="text-[13px] font-semibold text-gray-800 mb-2">Present address</p>
                    <AddressBlock value={form.currentAddress} onChange={(key, v) => updateAddress("currentAddress", key, v)} />
                  </div>
                  <div className="border-t border-gray-100 pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[13px] font-semibold text-gray-800">Permanent address</p>
                      <FormCheckbox label="Same as Present address"
                        checked={form.sameAsPresent}
                        onChange={(e) => setForm({ ...form, sameAsPresent: e.target.checked })} />
                    </div>
                    {!form.sameAsPresent && (
                      <AddressBlock value={form.permanentAddress} onChange={(key, v) => updateAddress("permanentAddress", key, v)} />
                    )}
                  </div>
                </div>
              </Section>

              <Section
                id="emergency"
                icon={<ShieldAlert size={18} />}
                title="Emergency Contact"
                subtitle="Person to reach in case of emergency. At least one recommended."
                active={activeStep === "emergency"}
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
                      <div className="grid grid-cols-2 gap-3">
                        <FormField label="Name" required>
                          <FormInput placeholder="Full name" value={c.name} onChange={(e) => updateEmergencyContact(i, "name", e.target.value)} />
                        </FormField>
                        <FormField label="Relationship" required>
                          <UiSelect
                            value={c.relationship}
                            onChange={(v) => updateEmergencyContact(i, "relationship", v)}
                            placeholder="Select"
                            options={RELATIONS.map((r) => ({ value: r, label: r }))}
                          />
                        </FormField>
                        <FormField label="Contact number" required>
                          <FormInput
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]{10}"
                            maxLength={10}
                            placeholder="10-digit number"
                            value={c.phone}
                            // Strip non-digits and hard-cap at 10 — typing/paste can't exceed.
                            onChange={(e) => updateEmergencyContact(i, "phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                          />
                        </FormField>
                        <FormField label="Email">
                          <FormInput type="email" placeholder="optional" value={c.email} onChange={(e) => updateEmergencyContact(i, "email", e.target.value)} />
                        </FormField>
                        <FormField label="Address" className="col-span-2">
                          <FormTextarea rows={2} placeholder="Full address" value={c.address} onChange={(e) => updateEmergencyContact(i, "address", e.target.value)} />
                        </FormField>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={addEmergencyContact}
                    className="flex items-center gap-1.5 text-xs text-[#22c55e] hover:underline">
                    <Plus size={13} /> Add another contact
                  </button>
                </div>
              </Section>

              <Section
                id="professional"
                icon={<Briefcase size={18} />}
                title="Professional Details"
                subtitle="Job, qualifications and onboarding template."
                active={activeStep === "professional"}
              >
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <FormField label="Title" required>
                    {designationOpts.length > 0 ? (
                      <Select value={form.designationId}
                        onChange={(v) => {
                          const d = designationOpts.find((x) => x.value === v);
                          setForm({ ...form, designationId: v, jobTitle: d?.label ?? "" });
                        }}
                        options={designationOpts} placeholder="Select title" searchable clearable />
                    ) : (
                      <FormInput placeholder="Enter title" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
                    )}
                  </FormField>
                  <FormField label="Department" required>
                    <Select value={form.departmentId} onChange={(v) => setForm({ ...form, departmentId: v })}
                      placeholder="Select department" searchable clearable
                      options={(depts?.data ?? []).map((d) => ({ value: d.id, label: d.name }))} />
                  </FormField>
                  <FormField label="Office Location">
                    <Select value={form.officeLocationId} onChange={(v) => setForm({ ...form, officeLocationId: v })}
                      options={(locs?.data ?? []).map((l) => ({ value: l.id, label: l.name }))}
                      placeholder="Select location" searchable clearable />
                  </FormField>
                  <FormField label="Reporting Manager" required>
                    <Select value={form.reportingManagerId} onChange={(v) => setForm({ ...form, reportingManagerId: v })}
                      options={(managers?.data ?? []).map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName} (${m.employeeCode})` }))}
                      placeholder="Search manager" searchable clearable />
                  </FormField>
                  <FormField label="Role" required>
                    <Select value={form.roleId} onChange={(v) => setForm({ ...form, roleId: v })}
                      options={(roles?.data ?? []).map((r) => ({ value: r.id, label: r.name }))}
                      placeholder="Select role (controls permissions)" searchable clearable />
                  </FormField>
                  <FormField label="Salary Template" required>
                    <Select value={form.salaryTemplateId} onChange={(v) => setForm({ ...form, salaryTemplateId: v })}
                      options={(salaryTemplates?.data ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
                      placeholder="Select template" searchable clearable />
                  </FormField>
                  <FormField label="CTC (LPA)" required>
                    <NumberInput min={0} value={form.ctcLpa} onChange={(v) => setForm({ ...form, ctcLpa: v })}
                      placeholder="e.g. 12.5"
                      className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-[#166534]" />
                  </FormField>
                  <FormField label="Source of Hire">
                    <Select value={form.sourceOfHire} onChange={(v) => setForm({ ...form, sourceOfHire: v as SourceOfHire })}
                      placeholder="Select source" clearable options={SOURCES.map((s) => ({ value: s, label: s }))} />
                  </FormField>
                  <FormField label="Experience (months)">
                    <NumberInput allowDecimal={false} min={0} value={form.previousExperience} onChange={(v) => setForm({ ...form, previousExperience: v })} className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-[#166534]" />
                  </FormField>
                  <FormField label="Current Salary">
                    <NumberInput min={0} value={form.currentSalary} onChange={(v) => setForm({ ...form, currentSalary: v })} className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-[#166534]" />
                  </FormField>
                  <FormField label="Highest Qualification">
                    <FormInput placeholder="e.g. B.Tech Computer Science" value={form.highestQualification} onChange={(e) => setForm({ ...form, highestQualification: e.target.value })} />
                  </FormField>
                  <FormField label="Tentative Joining Date" required>
                    <FormInput type="date" value={form.tentativeJoiningDate} min={todayInput()}
                      onChange={(e) => setForm({ ...form, tentativeJoiningDate: e.target.value, dateOfJoining: form.dateOfJoining || e.target.value })} />
                  </FormField>
                  <FormField label="Onboarding Template" required>
                    <Select value={form.templateId} onChange={(v) => setForm({ ...form, templateId: v })}
                      placeholder="Select a template" searchable clearable
                      options={(templates?.data ?? []).map((t) => ({
                        value: t.id, label: t.name,
                        description: `${Array.isArray(t.tasks) ? t.tasks.length : 0} tasks`,
                      }))} />
                  </FormField>
                  <FormField label="Offer Letter" hint="PDF / DOC / Image · 5 MB max">
                    <div className="flex items-center gap-2 border border-[var(--border)] rounded-lg px-3 py-2 bg-white">
                      <Upload size={14} className="text-gray-400 shrink-0" />
                      <input placeholder="Paste URL or upload" value={form.offerLetterUrl}
                        onChange={(e) => setForm({ ...form, offerLetterUrl: e.target.value })}
                        className="flex-1 min-w-0 text-xs outline-none border-0 bg-transparent" />
                      <input
                        ref={offerLetterInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 5 * 1024 * 1024) { toast.error("File too large", "Max 5 MB"); return; }
                          setOfferLetterUploading(true);
                          const url = await uploadFile(file);
                          setOfferLetterUploading(false);
                          if (url) setForm((f) => ({ ...f, offerLetterUrl: url }));
                          e.target.value = "";
                        }}
                      />
                      <button
                        type="button"
                        disabled={offerLetterUploading}
                        onClick={() => offerLetterInputRef.current?.click()}
                        className="text-[#166534] text-xs font-semibold hover:underline shrink-0 disabled:opacity-60"
                      >
                        {offerLetterUploading ? "Uploading…" : "Browse"}
                      </button>
                    </div>
                  </FormField>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-4 mt-4">
                  <FormField label="Skill Set">
                    <FormTextarea rows={3} placeholder="React, Node.js, AWS..." value={form.skillSet} onChange={(e) => setForm({ ...form, skillSet: e.target.value })} />
                  </FormField>
                  <FormField label="Additional Information">
                    <FormTextarea rows={3} placeholder="Anything else worth noting" value={form.additionalInfo} onChange={(e) => setForm({ ...form, additionalInfo: e.target.value })} />
                  </FormField>
                </div>
              </Section>

              <Section
                id="education"
                icon={<GraduationCap size={18} />}
                title="Education"
                subtitle="Schools, degrees, and completion."
                active={activeStep === "education"}
                action={
                  <button type="button" onClick={addEducation} className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534] hover:underline">
                    <Plus size={12} /> Add Row
                  </button>
                }
              >
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50/60 text-table-head uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="text-left px-2 py-2 font-semibold">School Name</th>
                        <th className="text-left px-2 py-2 font-semibold">Degree</th>
                        <th className="text-left px-2 py-2 font-semibold">Field of Study</th>
                        <th className="text-left px-2 py-2 font-semibold">Completion</th>
                        <th className="text-left px-2 py-2 font-semibold">Notes</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {form.educations.map((e, i) => (
                        <tr key={i}>
                          <td className="px-1 py-2"><FormInput value={e.schoolName} onChange={(ev) => updateEducation(i, "schoolName", ev.target.value)} /></td>
                          <td className="px-1 py-2"><FormInput value={e.degree} onChange={(ev) => updateEducation(i, "degree", ev.target.value)} /></td>
                          <td className="px-1 py-2"><FormInput value={e.fieldOfStudy} onChange={(ev) => updateEducation(i, "fieldOfStudy", ev.target.value)} /></td>
                          <td className="px-1 py-2"><FormInput type="date" value={e.completionDate} onChange={(ev) => updateEducation(i, "completionDate", ev.target.value)} /></td>
                          <td className="px-1 py-2"><FormInput value={e.notes} onChange={(ev) => updateEducation(i, "notes", ev.target.value)} /></td>
                          <td className="px-1 py-2 text-center">
                            {form.educations.length > 1 && <button type="button" onClick={() => removeEducation(i)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"><Trash2 size={14} /></button>}
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
                title="Experience"
                subtitle="Past roles and organisations."
                active={activeStep === "experience"}
                action={
                  <button type="button" onClick={addExperience} className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534] hover:underline">
                    <Plus size={12} /> Add Row
                  </button>
                }
              >
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50/60 text-table-head uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="text-left px-2 py-2 font-semibold">Occupation</th>
                        <th className="text-left px-2 py-2 font-semibold">Company</th>
                        <th className="text-left px-2 py-2 font-semibold">Summary</th>
                        <th className="text-left px-2 py-2 font-semibold">Duration</th>
                        <th className="text-left px-2 py-2 font-semibold">Current</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {form.pastExperiences.map((e, i) => (
                        <tr key={i}>
                          <td className="px-1 py-2"><FormInput value={e.occupation} onChange={(ev) => updateExperience(i, "occupation", ev.target.value)} /></td>
                          <td className="px-1 py-2"><FormInput value={e.company} onChange={(ev) => updateExperience(i, "company", ev.target.value)} /></td>
                          <td className="px-1 py-2"><FormInput value={e.summary} onChange={(ev) => updateExperience(i, "summary", ev.target.value)} /></td>
                          <td className="px-1 py-2"><FormInput value={e.duration} onChange={(ev) => updateExperience(i, "duration", ev.target.value)} placeholder="2y 3m" /></td>
                          <td className="px-1 py-2">
                            <UiSelect value={e.currentlyWorkHere ? "Yes" : "No"}
                              onChange={(v) => updateExperience(i, "currentlyWorkHere", v === "Yes")}
                              size="sm" options={[{ value: "No", label: "No" }, { value: "Yes", label: "Yes" }]} />
                          </td>
                          <td className="px-1 py-2 text-center">
                            {form.pastExperiences.length > 1 && <button type="button" onClick={() => removeExperience(i)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"><Trash2 size={14} /></button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              <Section
                id="family"
                icon={<Users size={18} />}
                title="Family Details"
                subtitle="Spouse, children, parents and dependents."
                active={activeStep === "family"}
                action={
                  <button type="button" onClick={addFamilyMember} className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534] hover:underline">
                    <Plus size={12} /> Add Row
                  </button>
                }
              >
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50/60 text-table-head uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="text-left px-2 py-2 font-semibold">Name</th>
                        <th className="text-left px-2 py-2 font-semibold">Relation</th>
                        <th className="text-left px-2 py-2 font-semibold">Date of Birth</th>
                        <th className="text-left px-2 py-2 font-semibold">Occupation</th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {form.familyMembers.map((m, i) => (
                        <tr key={i}>
                          <td className="px-1 py-2"><FormInput value={m.name} onChange={(ev) => updateFamilyMember(i, "name", ev.target.value)} /></td>
                          <td className="px-1 py-2">
                            <UiSelect value={m.relation} onChange={(v) => updateFamilyMember(i, "relation", v)}
                              size="sm" options={FAMILY_RELATIONS.map((r) => ({ value: r, label: r }))} placeholder="Select" />
                          </td>
                          <td className="px-1 py-2"><FormInput type="date" value={m.dob} onChange={(ev) => updateFamilyMember(i, "dob", ev.target.value)} /></td>
                          <td className="px-1 py-2"><FormInput value={m.occupation} onChange={(ev) => updateFamilyMember(i, "occupation", ev.target.value)} /></td>
                          <td className="px-1 py-2 text-center">
                            {form.familyMembers.length > 1 && <button type="button" onClick={() => removeFamilyMember(i)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"><Trash2 size={14} /></button>}
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
                active={activeStep === "certifications"}
                action={
                  <button type="button" onClick={addCertification} className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534] hover:underline">
                    <Plus size={12} /> Add Row
                  </button>
                }
              >
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50/60 text-table-head uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="text-left px-2 py-2 font-semibold">Name</th>
                        <th className="text-left px-2 py-2 font-semibold">Course Name</th>
                        <th className="text-left px-2 py-2 font-semibold">Issuing Authority</th>
                        <th className="text-left px-2 py-2 font-semibold">Year</th>
                        <th className="text-left px-2 py-2 font-semibold">Expiry</th>
                        <th className="text-left px-2 py-2 font-semibold">Credential URL</th>
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
                            {form.certifications.length > 1 && <button type="button" onClick={() => removeCertification(i)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"><Trash2 size={14} /></button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>

              {/* In-card step navigation — sits directly under the active card
                  so Next/Submit is reachable without scrolling to the footer. */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                {renderStepButtons()}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between gap-2 bg-white sticky bottom-0">
            <div className="flex items-center gap-2">
              <Link href="/onboarding" className="btn btn-ghost">Cancel</Link>
              <span className="text-xs text-gray-400 hidden sm:inline">Step {stepIndex + 1} of {STEPS.length}</span>
            </div>
            <div className="flex items-center gap-2">
              {renderStepButtons()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function isValidUrl(s: string) {
  if (!s) return false;
  try { new URL(s); return true; } catch { return false; }
}

function hasAddress(a: Address) {
  return !!(a.line1 || a.city || a.state || a.country || a.postalCode);
}

function Section({
  id, icon, title, subtitle, action, children, active,
}: {
  id: StepId;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  active: boolean;
}) {
  return (
    <section data-step-id={id} className={clsx("surface-card p-4", !active && "hidden")}>
      <div className="flex items-start justify-between gap-3 mb-4 pb-4 border-b border-gray-100">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#166534]/5 text-[#166534] flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div>
            <h2 className="text-[13px] font-semibold text-gray-900 leading-tight">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          </div>
        </div>
        {action}
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
        <Select value={value.country} onChange={(v) => onChange("country", v)} placeholder="Country" searchable clearable options={COUNTRY_OPTS} />
      </div>
      <div className="col-span-2">
        <Select value={value.state} onChange={(v) => onChange("state", v)} placeholder="State" searchable clearable options={STATE_OPTS} />
      </div>
      <div className="col-span-2">
        <FormInput placeholder="Postal Code" value={value.postalCode} onChange={(e) => onChange("postalCode", e.target.value)} />
      </div>
    </div>
  );
}
