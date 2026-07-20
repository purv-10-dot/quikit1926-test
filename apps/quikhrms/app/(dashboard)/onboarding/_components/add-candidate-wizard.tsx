"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { useDepartments, useDesignations, useLocations, useRoles, useSalaryTemplates } from "@/lib/hooks/use-ref-data";
import { clsx } from "clsx";
import {
  X, Check, Save, ArrowLeft, ArrowRight, Plus, Trash2, Lightbulb, Info,
  UserPlus, User, ShieldCheck, MapPin, Phone, Briefcase, GraduationCap, History, Users, Award,
  type LucideIcon,
} from "lucide-react";

/* ── Types the create endpoint accepts (mirrors addCandidateSchema) ── */
interface Addr { line1: string; line2: string; city: string; state: string; postalCode: string; country: string }
interface Emergency { name: string; relationship: string; phone: string; email: string; address: string }
interface Education { schoolName: string; degree: string; fieldOfStudy: string; completionDate: string; notes: string }
interface Experience { occupation: string; company: string; summary: string; duration: string; currentlyWorkHere: boolean }
interface Family { name: string; relation: string; dob: string; occupation: string }
interface Certification { name: string; courseName: string; issuingAuthority: string; year: string; expiryDate: string; credentialUrl: string }

interface RefItem { id: string; name?: string; title?: string; firstName?: string; lastName?: string }

const emptyAddr = (): Addr => ({ line1: "", line2: "", city: "", state: "", postalCode: "", country: "" });
const emptyEmergency = (): Emergency => ({ name: "", relationship: "", phone: "", email: "", address: "" });
const emptyEducation = (): Education => ({ schoolName: "", degree: "", fieldOfStudy: "", completionDate: "", notes: "" });
const emptyExperience = (): Experience => ({ occupation: "", company: "", summary: "", duration: "", currentlyWorkHere: false });
const emptyFamily = (): Family => ({ name: "", relation: "", dob: "", occupation: "" });
const emptyCert = (): Certification => ({ name: "", courseName: "", issuingAuthority: "", year: "", expiryDate: "", credentialUrl: "" });

const SOURCES = ["Referral", "JobPortal", "LinkedIn", "Agency", "Campus", "Direct", "Other"];
const RELATIONS = ["Spouse", "Child", "Father", "Mother", "Sibling", "Guardian", "Other"];

const STEPS: { title: string; subtitle: string; icon: LucideIcon }[] = [
  { title: "Personal Details", subtitle: "Basic contact information", icon: User },
  { title: "Identity", subtitle: "KYC details", icon: ShieldCheck },
  { title: "Address", subtitle: "Present & permanent", icon: MapPin },
  { title: "Emergency Contact", subtitle: "Next of kin / SOS", icon: Phone },
  { title: "Professional", subtitle: "Job & qualifications", icon: Briefcase },
  { title: "Education", subtitle: "Academic history", icon: GraduationCap },
  { title: "Experience", subtitle: "Past roles", icon: History },
  { title: "Family Details", subtitle: "Dependents & relatives", icon: Users },
  { title: "Certifications", subtitle: "Courses & credentials", icon: Award },
];

const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition";
const labelCls = "block text-xs font-medium text-gray-700 mb-1.5";
const thCls = "text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 px-1 pb-2";
const addRowCls = "w-full flex items-center justify-center gap-2 border border-gray-200 rounded-xl py-3 text-[13px] font-semibold text-[#16a34a] hover:bg-green-50/60 transition";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (emp: NewJoinee, draft: boolean) => void;
}
export interface NewJoinee {
  id: string; firstName: string; lastName: string; employeeCode: string;
  workEmail: string; personalEmail: string | null; dateOfJoining: string; jobTitle: string | null;
}

export function AddCandidateWizard({ open, onClose, onCreated }: Props) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    firstName: "", lastName: "", workEmail: "", personalEmail: "", personalPhone: "", profilePhoto: "",
    panNumber: "", aadhaarNumber: "",
    sameAsPresent: false,
    jobTitle: "", departmentId: "", designationId: "", officeLocationId: "", reportingManagerId: "", roleId: "",
    sourceOfHire: "Direct", previousExperience: null as number | null, currentSalary: null as number | null,
    salaryTemplateId: "", ctcLpa: null as number | null,
    dateOfJoining: "", tentativeJoiningDate: "", offerLetterUrl: "", highestQualification: "", skillSet: "", additionalInfo: "",
    templateId: "",
  });
  const [currentAddress, setCurrentAddress] = useState<Addr>(emptyAddr());
  const [permanentAddress, setPermanentAddress] = useState<Addr>(emptyAddr());
  const [emergency, setEmergency] = useState<Emergency[]>([emptyEmergency()]);
  const [educations, setEducations] = useState<Education[]>([emptyEducation()]);
  const [experiences, setExperiences] = useState<Experience[]>([emptyExperience()]);
  const [family, setFamily] = useState<Family[]>([emptyFamily()]);
  const [certs, setCerts] = useState<Certification[]>([emptyCert()]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const addRow = (s: number) => {
    if (s === 3) setEmergency((r) => [...r, emptyEmergency()]);
    else if (s === 5) setEducations((r) => [...r, emptyEducation()]);
    else if (s === 6) setExperiences((r) => [...r, emptyExperience()]);
    else if (s === 7) setFamily((r) => [...r, emptyFamily()]);
    else if (s === 8) setCerts((r) => [...r, emptyCert()]);
  };

  // Reference data
  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();
  const { data: locs } = useLocations();
  const { data: roles } = useRoles();
  const { data: templatesData } = useSalaryTemplates();
  const { data: managers } = useQuery({ queryKey: ["employees-mgrs"], queryFn: () => api.get<RefItem[]>("/api/v1/hrms/employees?limit=200") });
  const { data: onbTemplates } = useQuery({ queryKey: ["onboarding", "templates"], queryFn: () => api.get<RefItem[]>("/api/v1/hrms/onboarding/templates?isActive=true&limit=100") });

  const deptOpts = ((depts?.data ?? []) as RefItem[]).map((d) => ({ value: d.id, label: d.name ?? "" }));
  const desigOpts = ((desigs?.data ?? []) as RefItem[]).map((d) => ({ value: d.id, label: d.title ?? d.name ?? "" }));
  const locOpts = ((locs?.data ?? []) as RefItem[]).map((d) => ({ value: d.id, label: d.name ?? "" }));
  const roleOpts = ((roles?.data ?? []) as RefItem[]).map((d) => ({ value: d.id, label: d.name ?? "" }));
  const salaryOpts = ((templatesData?.data ?? []) as RefItem[]).map((d) => ({ value: d.id, label: d.name ?? d.id }));
  const mgrOpts = ((managers?.data ?? []) as RefItem[]).map((m) => ({ value: m.id, label: `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() || m.id }));
  const onbOpts = ((onbTemplates?.data ?? []) as RefItem[]).map((d) => ({ value: d.id, label: d.name ?? "" }));

  const reset = () => {
    setStep(0);
    setForm({
      firstName: "", lastName: "", workEmail: "", personalEmail: "", personalPhone: "", profilePhoto: "",
      panNumber: "", aadhaarNumber: "", sameAsPresent: false,
      jobTitle: "", departmentId: "", designationId: "", officeLocationId: "", reportingManagerId: "", roleId: "",
      sourceOfHire: "Direct", previousExperience: null, currentSalary: null,
      salaryTemplateId: "", ctcLpa: null,
      dateOfJoining: "", tentativeJoiningDate: "", offerLetterUrl: "", highestQualification: "", skillSet: "", additionalInfo: "",
      templateId: "",
    });
    setCurrentAddress(emptyAddr()); setPermanentAddress(emptyAddr());
    setEmergency([emptyEmergency()]); setEducations([emptyEducation()]);
    setExperiences([emptyExperience()]); setFamily([emptyFamily()]); setCerts([emptyCert()]);
  };

  const buildPayload = (saveDraft: boolean) => {
    const hasAddr = (a: Addr) => Object.values(a).some((v) => v && String(v).trim());
    return {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      workEmail: form.workEmail.trim(),
      personalEmail: form.personalEmail.trim() || undefined,
      personalPhone: form.personalPhone.trim() || undefined,
      profilePhoto: form.profilePhoto.trim() || undefined,
      panNumber: form.panNumber.trim() || undefined,
      aadhaarNumber: form.aadhaarNumber.trim() || undefined,
      currentAddress: hasAddr(currentAddress) ? currentAddress : undefined,
      permanentAddress: hasAddr(permanentAddress) ? permanentAddress : undefined,
      sameAsPresent: form.sameAsPresent,
      jobTitle: form.jobTitle.trim() || undefined,
      departmentId: form.departmentId || undefined,
      designationId: form.designationId || undefined,
      officeLocationId: form.officeLocationId || undefined,
      reportingManagerId: form.reportingManagerId || undefined,
      roleId: form.roleId || undefined,
      sourceOfHire: form.sourceOfHire || undefined,
      previousExperience: form.previousExperience ?? undefined,
      currentSalary: form.currentSalary ?? undefined,
      salaryTemplateId: form.salaryTemplateId || undefined,
      ctcLpa: form.ctcLpa ?? undefined,
      dateOfJoining: form.dateOfJoining || undefined,
      tentativeJoiningDate: form.tentativeJoiningDate || undefined,
      offerLetterUrl: form.offerLetterUrl.trim() || undefined,
      highestQualification: form.highestQualification.trim() || undefined,
      skillSet: form.skillSet.trim() || undefined,
      additionalInfo: form.additionalInfo.trim() || undefined,
      templateId: form.templateId || undefined,
      educations: educations.filter((e) => Object.values(e).some((v) => v && String(v).trim())),
      pastExperiences: experiences.filter((e) => e.occupation || e.company || e.summary || e.duration),
      emergencyContacts: emergency.filter((e) => e.name && e.relationship && e.phone),
      familyMembers: family.filter((f) => f.name && f.relation),
      certifications: certs.filter((c) => c.name),
      saveDraft,
    };
  };

  const mut = useMutation({
    // Errors are surfaced via the toast below — suppress the global modal so one
    // failure doesn't show both a toast and a blocking dialog.
    meta: { suppressGlobalError: true },
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ employee: NewJoinee; draft?: boolean }>("/api/v1/hrms/onboarding/candidates", body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["onboarding"] });
      const emp = res?.data?.employee;
      if (emp) onCreated(emp, Boolean(res?.data?.draft));
      reset();
      onClose();
    },
    onError: (e) => toast.error("Couldn't add candidate", e instanceof Error ? e.message : "Please try again."),
  });

  const missingRequired = () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.workEmail.trim()) return { step: 0, msg: "First name, last name and work email are required." };
    if (!form.reportingManagerId || !form.roleId || !form.salaryTemplateId || !(form.ctcLpa && form.ctcLpa > 0))
      return { step: 4, msg: "Reporting manager, role, salary template and CTC (LPA) are required." };
    return null;
  };

  const submit = (saveDraft: boolean) => {
    const miss = missingRequired();
    if (miss) { setStep(miss.step); toast.error("Missing required fields", miss.msg); return; }
    mut.mutate(buildPayload(saveDraft));
  };

  const isLast = step === STEPS.length - 1;
  const next = () => { if (isLast) submit(false); else setStep((s) => Math.min(s + 1, STEPS.length - 1)); };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  if (!open) return null;
  const Section = STEPS[step];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-white via-[#f7faf8] to-[#eef4f0]">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-green-50 text-[#16a34a] flex items-center justify-center">
            <UserPlus size={20} />
          </div>
          <div>
            <h1 className="text-[19px] font-bold text-gray-900 leading-tight">Add Candidate</h1>
            <p className="text-[13px] text-gray-500">Onboard a new candidate to the organisation.</p>
          </div>
        </div>
        <button onClick={onClose} className="w-9 h-9 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 flex items-center justify-center transition">
          <X size={18} />
        </button>
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* Stepper sidebar */}
        <aside className="hidden md:flex w-[300px] shrink-0 flex-col justify-between border-r border-gray-100 bg-white/60 px-5 py-6 overflow-y-auto">
          <ol className="relative">
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li key={s.title} className="relative pl-11 pb-6 last:pb-0">
                  {i < STEPS.length - 1 && (
                    <span className={clsx("absolute left-[13px] top-7 bottom-1 w-0.5", done ? "bg-[#16a34a]" : "bg-gray-200")} />
                  )}
                  <span
                    className={clsx(
                      "absolute left-0 top-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ring-4 ring-white",
                      active ? "bg-[#16a34a] text-white" : done ? "bg-[#16a34a] text-white" : "bg-gray-100 text-gray-500",
                    )}
                  >
                    {done ? <Check size={14} /> : i + 1}
                  </span>
                  <div className={clsx("rounded-lg -mt-0.5 px-2 py-1", active && "bg-green-50")}>
                    <p className={clsx("text-[13px] font-semibold leading-tight", active ? "text-[#166534]" : "text-gray-900")}>{s.title}</p>
                    <p className="text-[11px] text-gray-500">{s.subtitle}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-6 rounded-xl bg-green-50/70 p-3">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-800">
              <Lightbulb size={14} className="text-[#16a34a]" /> Need help?
            </div>
            <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">You can save as draft and complete later from your dashboard.</p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-h-0 overflow-y-auto px-6 lg:px-10 py-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-xl bg-green-50 text-[#16a34a] flex items-center justify-center shrink-0">
                  <Section.icon size={22} />
                </div>
                <div>
                  <h2 className="text-[22px] font-bold text-gray-900 leading-tight">{Section.title}</h2>
                  <p className="text-[14px] text-gray-500 mt-0.5">{stepBlurb(step)}</p>
                </div>
              </div>
              {addBtn(step) && (
                <button
                  onClick={() => addRow(step)}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[#16a34a]/40 text-[#16a34a] px-3.5 py-2 text-[13px] font-semibold hover:bg-green-50 transition"
                >
                  <Plus size={15} /> {addBtn(step)}
                </button>
              )}
            </div>

            {/* Step body */}
            {step === 0 && (
              <Card>
                <Grid2>
                  <F label="First Name *"><input className={inputCls} placeholder="Enter first name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} /></F>
                  <F label="Last Name *"><input className={inputCls} placeholder="Enter last name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} /></F>
                  <F label="Work Email *"><input type="email" className={inputCls} placeholder="name@company.com" value={form.workEmail} onChange={(e) => set("workEmail", e.target.value)} /></F>
                  <F label="Personal Email"><input type="email" className={inputCls} placeholder="name@gmail.com" value={form.personalEmail} onChange={(e) => set("personalEmail", e.target.value)} /></F>
                  <F label="Personal Phone"><input className={inputCls} placeholder="+91…" value={form.personalPhone} onChange={(e) => set("personalPhone", e.target.value)} /></F>
                  <F label="Profile Photo URL"><input className={inputCls} placeholder="https://…" value={form.profilePhoto} onChange={(e) => set("profilePhoto", e.target.value)} /></F>
                </Grid2>
              </Card>
            )}

            {step === 1 && (
              <Card>
                <Grid2>
                  <F label="PAN Number"><input className={clsx(inputCls, "font-mono uppercase")} maxLength={10} placeholder="ABCDE1234F" value={form.panNumber} onChange={(e) => set("panNumber", e.target.value.toUpperCase())} /></F>
                  <F label="Aadhaar Number"><input className={clsx(inputCls, "font-mono")} maxLength={12} placeholder="XXXX XXXX XXXX" value={form.aadhaarNumber} onChange={(e) => set("aadhaarNumber", e.target.value)} /></F>
                </Grid2>
              </Card>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <Card title="Present Address">
                  <AddressFields value={currentAddress} onChange={setCurrentAddress} />
                </Card>
                <label className="flex items-center gap-2 text-sm text-gray-700 px-1">
                  <input type="checkbox" className="rounded border-gray-300" checked={form.sameAsPresent} onChange={(e) => set("sameAsPresent", e.target.checked)} />
                  Permanent address same as present
                </label>
                {!form.sameAsPresent && (
                  <Card title="Permanent Address">
                    <AddressFields value={permanentAddress} onChange={setPermanentAddress} />
                  </Card>
                )}
              </div>
            )}

            {step === 3 && (
              <Card>
                <RowTable
                  head={["NAME", "RELATION", "PHONE", "EMAIL"]}
                  rows={emergency}
                  onDelete={emergency.length > 1 ? (i) => setEmergency(emergency.filter((_, x) => x !== i)) : undefined}
                  render={(row, i) => (
                    <>
                      <input className={inputCls} placeholder="Enter full name" value={row.name} onChange={(e) => updateAt(setEmergency, emergency, i, { name: e.target.value })} />
                      <input className={inputCls} placeholder="e.g. Spouse" value={row.relationship} onChange={(e) => updateAt(setEmergency, emergency, i, { relationship: e.target.value })} />
                      <input className={inputCls} placeholder="+91…" value={row.phone} onChange={(e) => updateAt(setEmergency, emergency, i, { phone: e.target.value })} />
                      <input className={inputCls} placeholder="email (optional)" value={row.email} onChange={(e) => updateAt(setEmergency, emergency, i, { email: e.target.value })} />
                    </>
                  )}
                  addLabel="Add Another Contact"
                  onAdd={() => setEmergency([...emergency, emptyEmergency()])}
                />
              </Card>
            )}

            {step === 4 && (
              <Card>
                <Grid2>
                  <F label="Job Title"><input className={inputCls} placeholder="e.g. Software Engineer" value={form.jobTitle} onChange={(e) => set("jobTitle", e.target.value)} /></F>
                  <F label="Department"><Select value={form.departmentId} onChange={(v) => set("departmentId", v)} searchable placeholder="Select…" options={deptOpts} /></F>
                  <F label="Designation"><Select value={form.designationId} onChange={(v) => set("designationId", v)} searchable placeholder="Select…" options={desigOpts} /></F>
                  <F label="Office Location"><Select value={form.officeLocationId} onChange={(v) => set("officeLocationId", v)} searchable placeholder="Select…" options={locOpts} /></F>
                  <F label="Reporting Manager *"><Select value={form.reportingManagerId} onChange={(v) => set("reportingManagerId", v)} searchable placeholder="Select…" options={mgrOpts} /></F>
                  <F label="Role *"><Select value={form.roleId} onChange={(v) => set("roleId", v)} searchable placeholder="Select…" options={roleOpts} /></F>
                  <F label="Salary Template *"><Select value={form.salaryTemplateId} onChange={(v) => set("salaryTemplateId", v)} searchable placeholder="Select…" options={salaryOpts} /></F>
                  <F label="CTC (LPA) *"><NumberInput min={0} value={form.ctcLpa} onChange={(v) => set("ctcLpa", v)} className={inputCls} /></F>
                  <F label="Source of Hire"><Select value={form.sourceOfHire} onChange={(v) => set("sourceOfHire", v)} options={SOURCES.map((s) => ({ value: s, label: s }))} /></F>
                  <F label="Previous Experience (months)"><NumberInput allowDecimal={false} min={0} value={form.previousExperience} onChange={(v) => set("previousExperience", v)} className={inputCls} /></F>
                  <F label="Date of Joining"><input type="date" className={inputCls} value={form.dateOfJoining} onChange={(e) => set("dateOfJoining", e.target.value)} /></F>
                  <F label="Onboarding Template"><Select value={form.templateId} onChange={(v) => set("templateId", v)} searchable placeholder="Use default tasks" options={onbOpts} /></F>
                  <F label="Highest Qualification"><input className={inputCls} placeholder="e.g. B.Tech" value={form.highestQualification} onChange={(e) => set("highestQualification", e.target.value)} /></F>
                  <F label="Skills (comma-separated)"><input className={inputCls} placeholder="React, SQL…" value={form.skillSet} onChange={(e) => set("skillSet", e.target.value)} /></F>
                </Grid2>
              </Card>
            )}

            {step === 5 && (
              <Card>
                <RowTable
                  head={["SCHOOL / UNIVERSITY", "DEGREE", "FIELD OF STUDY", "COMPLETED"]}
                  rows={educations}
                  onDelete={educations.length > 1 ? (i) => setEducations(educations.filter((_, x) => x !== i)) : undefined}
                  render={(row, i) => (
                    <>
                      <input className={inputCls} placeholder="Institution" value={row.schoolName} onChange={(e) => updateAt(setEducations, educations, i, { schoolName: e.target.value })} />
                      <input className={inputCls} placeholder="e.g. B.Tech" value={row.degree} onChange={(e) => updateAt(setEducations, educations, i, { degree: e.target.value })} />
                      <input className={inputCls} placeholder="e.g. CSE" value={row.fieldOfStudy} onChange={(e) => updateAt(setEducations, educations, i, { fieldOfStudy: e.target.value })} />
                      <input type="date" className={inputCls} value={row.completionDate} onChange={(e) => updateAt(setEducations, educations, i, { completionDate: e.target.value })} />
                    </>
                  )}
                  addLabel="Add Another Qualification"
                  onAdd={() => setEducations([...educations, emptyEducation()])}
                />
              </Card>
            )}

            {step === 6 && (
              <Card>
                <RowTable
                  head={["ROLE / OCCUPATION", "COMPANY", "DURATION", "SUMMARY"]}
                  rows={experiences}
                  onDelete={experiences.length > 1 ? (i) => setExperiences(experiences.filter((_, x) => x !== i)) : undefined}
                  render={(row, i) => (
                    <>
                      <input className={inputCls} placeholder="e.g. Developer" value={row.occupation} onChange={(e) => updateAt(setExperiences, experiences, i, { occupation: e.target.value })} />
                      <input className={inputCls} placeholder="Company" value={row.company} onChange={(e) => updateAt(setExperiences, experiences, i, { company: e.target.value })} />
                      <input className={inputCls} placeholder="e.g. 2 yrs" value={row.duration} onChange={(e) => updateAt(setExperiences, experiences, i, { duration: e.target.value })} />
                      <input className={inputCls} placeholder="What they did" value={row.summary} onChange={(e) => updateAt(setExperiences, experiences, i, { summary: e.target.value })} />
                    </>
                  )}
                  addLabel="Add Another Role"
                  onAdd={() => setExperiences([...experiences, emptyExperience()])}
                />
              </Card>
            )}

            {step === 7 && (
              <div className="space-y-6">
                <Card>
                  <RowTable
                    head={["NAME", "RELATION", "DATE OF BIRTH", "OCCUPATION"]}
                    rows={family}
                    onDelete={family.length > 1 ? (i) => setFamily(family.filter((_, x) => x !== i)) : undefined}
                    render={(row, i) => (
                      <>
                        <input className={inputCls} placeholder="Enter full name" value={row.name} onChange={(e) => updateAt(setFamily, family, i, { name: e.target.value })} />
                        <Select value={row.relation} onChange={(v) => updateAt(setFamily, family, i, { relation: v })} placeholder="Select relation" options={RELATIONS.map((r) => ({ value: r, label: r }))} />
                        <input type="date" className={inputCls} value={row.dob} onChange={(e) => updateAt(setFamily, family, i, { dob: e.target.value })} />
                        <input className={inputCls} placeholder="Enter occupation" value={row.occupation} onChange={(e) => updateAt(setFamily, family, i, { occupation: e.target.value })} />
                      </>
                    )}
                    addLabel="Add Another Member"
                    onAdd={() => setFamily([...family, emptyFamily()])}
                  />
                </Card>
                <div className="relative overflow-hidden rounded-xl bg-green-50/70 ring-1 ring-green-100 p-5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-6 h-6 rounded-full bg-white ring-1 ring-green-200 text-[#16a34a] flex items-center justify-center"><Info size={13} /></span>
                    <span className="text-[15px] font-semibold text-gray-800">Tip</span>
                  </div>
                  <p className="text-[13px] text-gray-600 max-w-2xl leading-relaxed">Adding family details helps us support the well-being of our employees and their loved ones.</p>
                  <svg className="pointer-events-none absolute right-4 -bottom-2 opacity-70" width="160" height="90" viewBox="0 0 160 90" fill="none" aria-hidden="true">
                    <path d="M120 30c14-10 30-6 36 4-10 2-16 10-16 10s-12-6-20-14z" fill="#86efac" fillOpacity="0.7" />
                    <path d="M150 44c-10 4-18 14-18 14s-2-14 6-22c6-6 14-4 12 8z" fill="#4ade80" fillOpacity="0.6" />
                    <circle cx="86" cy="40" r="12" fill="#34d399" fillOpacity="0.55" />
                    <circle cx="112" cy="44" r="14" fill="#22c55e" fillOpacity="0.5" />
                    <rect x="74" y="52" width="26" height="34" rx="13" fill="#34d399" fillOpacity="0.55" />
                    <rect x="100" y="56" width="30" height="34" rx="15" fill="#22c55e" fillOpacity="0.5" />
                  </svg>
                </div>
              </div>
            )}

            {step === 8 && (
              <Card>
                <RowTable
                  head={["CERTIFICATION", "ISSUING AUTHORITY", "YEAR", "CREDENTIAL URL"]}
                  rows={certs}
                  onDelete={certs.length > 1 ? (i) => setCerts(certs.filter((_, x) => x !== i)) : undefined}
                  render={(row, i) => (
                    <>
                      <input className={inputCls} placeholder="e.g. AWS SA" value={row.name} onChange={(e) => updateAt(setCerts, certs, i, { name: e.target.value })} />
                      <input className={inputCls} placeholder="e.g. Amazon" value={row.issuingAuthority} onChange={(e) => updateAt(setCerts, certs, i, { issuingAuthority: e.target.value })} />
                      <input className={inputCls} placeholder="e.g. 2025" value={row.year} onChange={(e) => updateAt(setCerts, certs, i, { year: e.target.value })} />
                      <input className={inputCls} placeholder="https://…" value={row.credentialUrl} onChange={(e) => updateAt(setCerts, certs, i, { credentialUrl: e.target.value })} />
                    </>
                  )}
                  addLabel="Add Another Certification"
                  onAdd={() => setCerts([...certs, emptyCert()])}
                />
              </Card>
            )}
          </div>
        </main>
      </div>

      {/* Footer */}
      <footer className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 bg-white/85 backdrop-blur border-t border-gray-100">
        <button
          onClick={() => submit(true)}
          disabled={mut.isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
        >
          <Save size={15} /> Save Draft
        </button>

        <div className="flex-1 max-w-md">
          <p className="text-[12px] text-gray-500 mb-1.5">Step {step + 1} of {STEPS.length}</p>
          <div className="flex gap-1">
            {STEPS.map((_, i) => (
              <span key={i} className={clsx("h-1.5 flex-1 rounded-full", i <= step ? "bg-[#16a34a]" : "bg-gray-200")} />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={back}
            disabled={step === 0 || mut.isPending}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <button
            onClick={next}
            disabled={mut.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[#16a34a] hover:bg-[#15803d] text-white px-5 py-2 text-[13px] font-semibold shadow-sm disabled:opacity-60 transition"
          >
            {isLast ? (mut.isPending ? "Adding…" : "Add Candidate") : "Next"} <ArrowRight size={15} />
          </button>
        </div>
      </footer>
    </div>
  );
}

/* ── Small building blocks ── */
function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm p-5">
      {title && <p className="text-[13px] font-semibold text-gray-800 mb-4">{title}</p>}
      {children}
    </div>
  );
}
function Grid2({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">{children}</div>;
}
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className={labelCls}>{label}</label>{children}</div>;
}
function AddressFields({ value, onChange }: { value: Addr; onChange: (a: Addr) => void }) {
  const u = (patch: Partial<Addr>) => onChange({ ...value, ...patch });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
      <F label="Address Line 1"><input className={inputCls} value={value.line1} onChange={(e) => u({ line1: e.target.value })} /></F>
      <F label="Address Line 2"><input className={inputCls} value={value.line2} onChange={(e) => u({ line2: e.target.value })} /></F>
      <F label="City"><input className={inputCls} value={value.city} onChange={(e) => u({ city: e.target.value })} /></F>
      <F label="State"><input className={inputCls} value={value.state} onChange={(e) => u({ state: e.target.value })} /></F>
      <F label="Postal Code"><input className={inputCls} value={value.postalCode} onChange={(e) => u({ postalCode: e.target.value })} /></F>
      <F label="Country"><input className={inputCls} value={value.country} onChange={(e) => u({ country: e.target.value })} /></F>
    </div>
  );
}

/** Generic repeating-row table matching the mock's Family Details layout. */
function RowTable<T>({ head, rows, render, onDelete, addLabel, onAdd }: {
  head: string[];
  rows: T[];
  render: (row: T, i: number) => React.ReactNode;
  onDelete?: (i: number) => void;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <div>
      <div className="hidden md:grid gap-3 mb-1" style={{ gridTemplateColumns: `repeat(${head.length}, 1fr) 44px` }}>
        {head.map((h) => <span key={h} className={thCls}>{h}</span>)}
        <span className={clsx(thCls, "text-right")}>ACTIONS</span>
      </div>
      <div className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="grid gap-3 items-start" style={{ gridTemplateColumns: `repeat(${head.length}, 1fr) 44px` }}>
            {render(row, i)}
            <button
              onClick={() => onDelete?.(i)}
              disabled={!onDelete}
              className="w-10 h-[38px] rounded-lg border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition"
              title="Remove"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <button onClick={onAdd} className={clsx(addRowCls, "mt-3")}>
        <Plus size={15} /> {addLabel}
      </button>
    </div>
  );
}

/** Immutably patch row `i` of a state array. */
function updateAt<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, arr: T[], i: number, patch: Partial<T>) {
  setter(arr.map((row, x) => (x === i ? { ...row, ...patch } : row)));
}

/* Per-step helpers */
function stepBlurb(step: number): string {
  return [
    "Basic contact information about the candidate.",
    "Government identity / KYC details.",
    "Present and permanent addresses.",
    "Who to contact in an emergency.",
    "Job, reporting, salary and qualifications.",
    "Academic background.",
    "Previous work experience.",
    "Add spouse, children, parents and other dependents.",
    "Professional courses and credentials.",
  ][step];
}
function addBtn(step: number): string | null {
  return {
    3: "Add Emergency Contact",
    5: "Add Qualification",
    6: "Add Role",
    7: "Add Family Member",
    8: "Add Certification",
  }[step] ?? null;
}
