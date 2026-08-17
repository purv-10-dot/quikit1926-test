"use client";

import { Suspense, useEffect, useRef, useState, Children, isValidElement } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDepartments, useDesignations, useLocations, useRoles, useSalaryTemplates } from "@/lib/hooks/use-ref-data";
import { useToast } from "@/components/hrms/toast";
import { useDialog } from "@/components/hrms/dialog";
import { PHONE_REGEX, PHONE_LOOSE_REGEX, PAN_REGEX, AADHAAR_REGEX, IFSC_REGEX, PINCODE_REGEX, BANK_ACCOUNT_REGEX } from "@/lib/validations/identifiers";
import {
  X, UserPlus, User, Phone, Briefcase, ShieldCheck, ClipboardCheck,
  Mail, Calendar, MapPin, Building2, IdCard, Save, Check, Banknote,
  ShieldAlert, Plus, Trash2, GraduationCap, History, Users, Award,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { FormInput } from "@/components/hrms/form";
import { clsx } from "clsx";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { BankDetailsFields } from "@/components/hrms/bank-details-fields";
import { SalaryBreakdown } from "@/components/hrms/salary-breakdown";
import { PageBackground } from "@/components/hrms/page-background";
import { INDIA_STATE_OPTS as STATE_OPTS } from "@/lib/data/india-states";
import { INDIAN_CITIES } from "@/lib/data/indian-cities";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";

// city (lowercased) → state, built once from the "City, State" dataset. Used to
// auto-fill Country + State when a known Indian city is typed in the address.
const CITY_STATE: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const entry of INDIAN_CITIES) {
    const i = entry.lastIndexOf(",");
    if (i === -1) continue;
    const city = entry.slice(0, i).trim().toLowerCase();
    const state = entry.slice(i + 1).trim();
    if (city && state && !m.has(city)) m.set(city, state);
  }
  return m;
})();

type EmploymentType = "FullTime" | "PartTime" | "Contract" | "Intern";
type WorkLocation = "Office" | "Remote" | "Hybrid";
type EmployeeStatus = "Active" | "PreBoarding" | "OnLeave" | "OnNotice" | "Suspended";
type Gender = "Male" | "Female" | "Transgender" | "NonBinary" | "PreferNotToSay";

interface Department { id: string; name: string; }
interface Designation { id: string; title: string; }
interface Location { id: string; name: string; }
interface Employee { id: string; firstName: string; lastName: string; }

type NoticePeriodOption = { id: string; name: string; duration: number; unit: "Days" | "Weeks" | "Months" };
/** Convert a configured notice period to whole days (same math as offboarding). */
const periodToDays = (p: NoticePeriodOption) => p.unit === "Months" ? p.duration * 30 : p.unit === "Weeks" ? p.duration * 7 : p.duration;
interface Role { id: string; code: string; name: string; }
interface SalaryTemplate { id: string; name: string; code: string; }

const EMP_TYPES: EmploymentType[] = ["FullTime", "PartTime", "Contract", "Intern"];
const WORK_LOCS: WorkLocation[] = ["Office", "Remote", "Hybrid"];

const STEPS = [
  { id: "personal",   num: 1, title: "Personal Details",   subtitle: "Basic info, contact & KYC",              icon: <User size={16} /> },
  { id: "address",    num: 2, title: "Address",            subtitle: "Present & permanent",                    icon: <MapPin size={16} /> },
  { id: "employment", num: 3, title: "Employment",         subtitle: "Job, work & salary account",             icon: <Briefcase size={16} /> },
  { id: "career",     num: 4, title: "Career & Education", subtitle: "Education, experience & certifications", icon: <GraduationCap size={16} /> },
  { id: "contacts",   num: 5, title: "Contacts & Family",  subtitle: "Emergency & dependents",                 icon: <Users size={16} /> },
  { id: "review",     num: 6, title: "Review",             subtitle: "Review & confirm",                       icon: <ClipboardCheck size={16} /> },
] as const;

interface EmergencyContact { name: string; relationship: string; phone: string; email: string; address: string; }
const emptyEmergencyContact: EmergencyContact = { name: "", relationship: "", phone: "", email: "", address: "" };
const RELATIONS = ["Spouse", "Parent", "Sibling", "Child", "Friend", "Relative", "Other"];

interface Address { line1: string; line2: string; city: string; country: string; state: string; postalCode: string; }
const emptyAddress: Address = { line1: "", line2: "", city: "", country: "", state: "", postalCode: "" };

interface Education { institution: string; degree: string; fieldOfStudy: string; startYear: string; endYear: string; grade: string; }
const emptyEducation: Education = { institution: "", degree: "", fieldOfStudy: "", startYear: "", endYear: "", grade: "" };

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
}
const emptyExperience: Experience = {
  company: "", designation: "", startDate: "", endDate: "", currentlyWorkHere: false,
  startCompensation: "", endCompensation: "", responsibilities: "", accomplishments: "",
  challenges: "", reasonForLeaving: "",
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
    <Suspense fallback={<div className="p-4 space-y-2"><SkeletonLine w="40%" h={16} /><SkeletonLine w="70%" h={12} /><SkeletonLine w="60%" h={12} /></div>}>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <NewEmployeePageInner />
    </Suspense>
  );
}

function NewEmployeePageInner() {
  const api = useApiClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  // Same gate the Edit page uses — a view-only (hrms.employee.read) user
  // reaching this page directly (URL, bookmark) would otherwise fill out the
  // whole form only to have POST /employees reject it with a 403 on submit.
  const { hasPermission, isLoading: permsLoading } = useDashboardConfig();
  const canManageEmployees = hasPermission("hrms.employee.write");

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
    noticePeriodId: "" as string,
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
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({
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

  // True wizard: only the active step is rendered — reset scroll to top on change.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeStep]);

  const scrollToStep = (id: StepId) => setActiveStep(id);

  const stepIdx = STEPS.findIndex((s) => s.id === activeStep);
  const isFirstStep = stepIdx <= 0;
  const isLastStep = stepIdx >= STEPS.length - 1;
  const goNext = () => { if (!isLastStep) setActiveStep(STEPS[stepIdx + 1].id); };
  const goBack = () => { if (!isFirstStep) setActiveStep(STEPS[stepIdx - 1].id); };

  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();
  const { data: locs } = useLocations();
  const { data: managers } = useQuery({ queryKey: ["employees-mgrs"], queryFn: () => api.get<Employee[]>("/api/v1/hrms/employees?limit=100&picker=1") });
  const { data: noticePeriodsData } = useQuery({ queryKey: ["notice-periods", "all"], queryFn: () => api.get<NoticePeriodOption[]>("/api/v1/hrms/offboarding/notice-periods?limit=100") });
  const noticePeriods = noticePeriodsData?.data ?? [];
  const { data: roles } = useRoles();
  const { data: salaryTemplates, isLoading: salaryTemplatesLoading } = useSalaryTemplates();
  const noSalaryTemplates = !salaryTemplatesLoading && (salaryTemplates?.data?.length ?? 0) === 0;

  const toast = useToast();
  const dialog = useDialog();

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/employees", body),
    onSuccess: () => {
      toast.success("Employee added", `${form.firstName} ${form.lastName} · send the invite from Users`);
      router.push("/settings/users");
    },
    // Errors handled by global MutationCache.onError in providers.tsx (single toast).
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Steps are rendered one at a time, so native `required` can't validate hidden
    // fields — validate everything here and jump to the offending step.
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("Name required", "First and last name are mandatory in Personal step.");
      scrollToStep("personal");
      return;
    }
    if (!form.dateOfBirth) {
      toast.error("Date of birth required", "Select date of birth in Personal step.");
      scrollToStep("personal");
      return;
    }
    if (!form.workEmail.trim()) {
      toast.error("Work email required", "Enter work email in Contact step.");
      scrollToStep("personal");
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(form.workEmail.trim())) {
      toast.error("Invalid work email", "Enter a valid work email address (e.g. name@company.com).");
      scrollToStep("personal");
      return;
    }
    if (form.personalEmail.trim() && !emailPattern.test(form.personalEmail.trim())) {
      toast.error("Invalid personal email", "Enter a valid personal email address.");
      scrollToStep("personal");
      return;
    }
    const phoneDigits = (v: string) => v.replace(/\D/g, "");
    if (!form.personalPhone.trim()) {
      toast.error("Personal phone required", "Enter a personal phone number in Contact step.");
      scrollToStep("personal");
      return;
    }
    if (phoneDigits(form.personalPhone).length !== 10) {
      toast.error("Invalid phone number", "Personal phone must be exactly 10 digits.");
      scrollToStep("personal");
      return;
    }
    if (form.workPhone.trim() && phoneDigits(form.workPhone).length !== 10) {
      toast.error("Invalid work phone", "Work phone must be exactly 10 digits.");
      scrollToStep("personal");
      return;
    }
    // Emergency-contact number: any filled row's Contact Number must be 10 digits.
    for (const ec of form.emergencyContacts) {
      const filled = ec.name.trim() || ec.relationship.trim() || ec.phone.trim() || ec.email.trim();
      if (filled && phoneDigits(ec.phone).length !== 10) {
        toast.error("Invalid contact number", "Emergency contact number must be exactly 10 digits.");
        scrollToStep("personal");
        return;
      }
      if (ec.email.trim() && !emailPattern.test(ec.email.trim())) {
        toast.error("Invalid contact email", "Emergency contact email is invalid.");
        scrollToStep("personal");
        return;
      }
    }
    if (!form.jobTitle.trim() || !form.designationId || !form.departmentId) {
      toast.error("Employment details required", "Job title, designation and department are mandatory.");
      scrollToStep("employment");
      return;
    }
    if (!form.dateOfJoining) {
      toast.error("Date of joining required", "Select date of joining in Employment step.");
      scrollToStep("employment");
      return;
    }
    if (form.dateOfJoining < new Date().toISOString().slice(0, 10)) {
      toast.error("Invalid date of joining", "Date of joining cannot be in the past.");
      scrollToStep("employment");
      return;
    }
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
    // Salary template + CTC are optional together — if HR picked a template,
    // CTC must come with it; if they left it blank (e.g. no templates exist
    // yet), salary is simply skipped and can be assigned later via Payroll →
    // Employee Salaries.
    if (form.salaryTemplateId && (form.ctcLpa == null || form.ctcLpa <= 0)) {
      toast.error("CTC (LPA) required", "Enter annual CTC in lakhs, or clear the salary template to skip salary for now.");
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
      scrollToStep("career");
      return;
    }
    if (!form.panNumber.trim() || !form.aadhaarNumber.trim()) {
      toast.error("Identity required", "PAN and Aadhaar are mandatory in Identity step.");
      scrollToStep("personal");
      return;
    }
    if (!form.bankName.trim() || !form.bankAccountNumber.trim() || !form.bankIfsc.trim()) {
      toast.error("Bank details required", "Bank name, account number and IFSC are mandatory.");
      scrollToStep("employment");
      return;
    }

    // ── Format & logical checks (mirror the server-side schema) ──
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(form.workEmail.trim())) {
      toast.error("Invalid work email", "Enter a valid work email in Contact step."); scrollToStep("personal"); return;
    }
    if (form.personalEmail.trim() && !emailRe.test(form.personalEmail.trim())) {
      toast.error("Invalid personal email", "Check the personal email in Contact step."); scrollToStep("personal"); return;
    }
    if (form.personalPhone.trim() && !PHONE_REGEX.test(form.personalPhone.trim())) {
      toast.error("Invalid mobile number", "Personal phone must be a valid 10-digit mobile."); scrollToStep("personal"); return;
    }
    if (form.workPhone.trim() && !PHONE_LOOSE_REGEX.test(form.workPhone.trim())) {
      toast.error("Invalid work phone", "Enter a valid work phone number."); scrollToStep("personal"); return;
    }
    if (!PINCODE_REGEX.test(form.currentAddress.postalCode.trim())) {
      toast.error("Invalid PIN code", "Postal code must be a 6-digit PIN."); scrollToStep("address"); return;
    }
    if (form.dateOfBirth) {
      const today = new Date().toISOString().slice(0, 10);
      const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 14);
      const minAgeDate = cutoff.toISOString().slice(0, 10);
      if (form.dateOfBirth > today) {
        toast.error("Check date of birth", "Date of birth cannot be in the future."); scrollToStep("personal"); return;
      }
      if (form.dateOfBirth > minAgeDate) {
        toast.error("Check date of birth", "Employee must be at least 14 years old."); scrollToStep("personal"); return;
      }
    }
    if (form.dateOfBirth && form.dateOfJoining && form.dateOfBirth >= form.dateOfJoining) {
      toast.error("Check dates", "Date of birth must be before the date of joining."); scrollToStep("personal"); return;
    }
    if (!PAN_REGEX.test(form.panNumber.trim().toUpperCase())) {
      toast.error("Invalid PAN", "PAN format: 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F)."); scrollToStep("personal"); return;
    }
    if (!AADHAAR_REGEX.test(form.aadhaarNumber.trim())) {
      toast.error("Invalid Aadhaar", "Aadhaar must be 12 digits starting 2-9."); scrollToStep("personal"); return;
    }
    if (!BANK_ACCOUNT_REGEX.test(form.bankAccountNumber.trim())) {
      toast.error("Invalid account number", "Account number must be 9–18 digits."); scrollToStep("employment"); return;
    }
    if (!IFSC_REGEX.test(form.bankIfsc.trim().toUpperCase())) {
      toast.error("Invalid IFSC", "IFSC format: 4 letters + 0 + 6 chars (e.g. HDFC0001234)."); scrollToStep("employment"); return;
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
      panNumber: form.panNumber.trim().toUpperCase() || undefined,
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
      noticePeriodId: form.noticePeriodId || undefined,
      noticePeriodDays: form.noticePeriodDays ?? undefined,
      previousExperience: form.previousExperience ?? undefined,
      status: form.status,
      bankAccounts: form.bankName.trim() && form.bankAccountNumber.trim()
        ? [{
            bankName: form.bankName.trim(),
            accountNumber: form.bankAccountNumber.trim(),
            ifscCode: form.bankIfsc.trim().toUpperCase() || undefined,
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
          grade: e.grade.trim() || undefined,
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
    // Confirmation popup so the user knows what's about to happen. No invite is
    // sent here — the portal invite is triggered later from the Users screen.
    const ok = await dialog.confirm({
      title: "Add this employee?",
      description: `Create ${form.firstName} ${form.lastName}? You can send their portal invite afterwards from the Users screen.`,
      confirmLabel: "Add employee",
      cancelLabel: "Keep editing",
      variant: "info",
    });
    if (!ok) return;
    createMut.mutate(body);
  };

  const deptName = depts?.data?.find((d) => d.id === form.departmentId)?.name;
  const desigName = desigs?.data?.find((d) => d.id === form.designationId)?.title;
  const locName = locs?.data?.find((l) => l.id === form.officeLocationId)?.name;
  const mgr = managers?.data?.find((m) => m.id === form.reportingManagerId);

  if (!permsLoading && !canManageEmployees) {
    return (
      <div className="max-w-2xl mx-auto mt-10">
        <div className="surface-card overflow-hidden">
          <div className="px-4 py-4 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
              <ShieldAlert size={20} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">Access not allowed</h1>
              <p className="text-xs text-gray-500">You don&apos;t have permission to add employees.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 rounded-2xl flex flex-col h-full">
      <header className="bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <Link
            href={returnTo && returnTo.startsWith("/") ? returnTo : "/employees"}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft size={14} /> Back to Employees
          </Link>
          <span className="w-px h-5 bg-gray-200 mx-1" />
          <div className="w-9 h-9 rounded-xl bg-[#166534]/5 text-[#166534] flex items-center justify-center">
            <UserPlus size={18} />
          </div>
          <h1 className="text-base font-semibold text-gray-900">Add Employee</h1>
        </div>
        <Link href="/org-chart" className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
          <X size={12} />
        </Link>
      </header>

      <div className="bg-white border-b border-gray-100 px-5 py-4 sticky top-[57px] z-10">
        <div className="max-w-none">
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
                      active ? "bg-green-600 text-white ring-4 ring-[#166534]/10"
                        : passed ? "bg-[#166534]/15 text-[#166534] hover:bg-[#166534]/25"
                        : "border-2 border-gray-300 text-gray-500 bg-white hover:border-gray-400",
                    )}
                  >
                    {passed ? <Check size={15} /> : <span className="flex items-center gap-0.5">{s.icon}</span>}
                  </button>
                  {idx < STEPS.length - 1 && (
                    <div className={clsx(
                      "flex-1 h-0.5 mx-1.5 rounded transition",
                      passed ? "bg-[#166534]/40" : "bg-gray-200",
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
                <span className="text-[13px] font-semibold text-[#166534]">{cur.title}</span>
                <span className="text-xs text-gray-500">— {cur.subtitle}</span>
              </div>
            );
          })()}
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex-1 flex flex-col min-h-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
          <div className="max-w-none pb-5">
            <StepPanels active={activeStep}>
            <Section
              id="personal"
              icon={<User size={18} />}
              title="Personal Details"
              subtitle="Basic information about the employee."
              sectionRef={(el) => { sectionRefs.current.personal = el; }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4">
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
                      { value: "Transgender", label: "Transgender" },
                      { value: "NonBinary", label: "Non-Binary" },
                      { value: "PreferNotToSay", label: "Prefer not to say" },
                    ]}
                  />
                </Field>
                <Field label="Date of Birth" required>
                  <input
                    type="date"
                    required
                    max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 14); return d.toISOString().slice(0, 10); })()}
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
                <div className="col-span-full flex items-center gap-4 pt-1">
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.isHandicapped}
                      onChange={(e) => setForm({ ...form, isHandicapped: e.target.checked })}
                      className="text-[#22c55e] rounded"
                    />
                    Handicapped
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-700 cursor-not-allowed" title="Auto-checked when age greater than 60">
                    <input
                      type="checkbox"
                      checked={form.isSeniorCitizen}
                      readOnly
                      disabled
                      className="text-[#22c55e] rounded"
                    />
                    Senior Citizen <span className="text-xs text-gray-400">(auto from DOB &gt; 60)</span>
                  </label>
                </div>

                {/* Statutory Applicability — per-employee opt-out of EPF / ESI / PT.
                    Defaults to all-true; unchecking suppresses that deduction in payroll. */}
                <div className="col-span-full pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
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
              id="personal"
              icon={<Phone size={18} />}
              title="Contact"
              subtitle="Contact information for communication."
              sectionRef={(el) => { sectionRefs.current.contact = el; }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4">
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
                <Field label="Personal Phone" required>
                  <IconInput icon={<Phone size={14} />}>
                    <input inputMode="numeric" maxLength={10} placeholder="10-digit mobile number" value={form.personalPhone} onChange={(e) => setForm({ ...form, personalPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })} className={inputCls} />
                  </IconInput>
                </Field>
                <Field label="Work Phone">
                  <IconInput icon={<Phone size={14} />}>
                    <input inputMode="numeric" maxLength={10} placeholder="10-digit work phone number" value={form.workPhone} onChange={(e) => setForm({ ...form, workPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })} className={inputCls} />
                  </IconInput>
                </Field>
              </div>
            </Section>

            <Section
              id="contacts"
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
                        <Trash2 size={12} />
                      </button>
                    )}
                    <div className="text-xs font-semibold text-gray-500 uppercase mb-3">
                      {i === 0 ? "Primary contact" : `Contact ${i + 1}`}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4">
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
                          <input inputMode="numeric" maxLength={10} placeholder="10-digit contact number" value={c.phone} onChange={(e) => updateEmergencyContact(i, "phone", e.target.value.replace(/\D/g, "").slice(0, 10))} className={inputCls} />
                        </IconInput>
                      </Field>
                      <Field label="Email">
                        <IconInput icon={<Mail size={14} />}>
                          <input type="email" placeholder="optional" value={c.email} onChange={(e) => updateEmergencyContact(i, "email", e.target.value)} className={inputCls} />
                        </IconInput>
                      </Field>
                      <div className="col-span-full">
                        <Field label="Address">
                          <textarea rows={2} placeholder="Full address" value={c.address} onChange={(e) => updateEmergencyContact(i, "address", e.target.value)} className={inputCls} />
                        </Field>
                      </div>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addEmergencyContact}
                  className="flex items-center gap-1.5 text-xs text-[#22c55e] hover:underline">
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
                  <p className="text-[13px] font-semibold text-gray-800 mb-2">Present address</p>
                  <AddressBlock required value={form.currentAddress} onChange={(key, v) => updateAddress("currentAddress", key, v)} />
                </div>
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[13px] font-semibold text-gray-800">Permanent address</p>
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4">
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
                <Field label="Office Location">
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
                <Field label="Salary Template">
                  {noSalaryTemplates ? (
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
                      No salary templates exist yet — salary will be skipped for now.{" "}
                      <Link href="/payroll/setup/salary-templates/new" className="font-semibold underline hover:text-gray-900">
                        Create a salary template
                      </Link>{" "}
                      to assign it later via Payroll &rarr; Employee Salaries.
                    </div>
                  ) : (
                    <>
                      <Select
                        value={form.salaryTemplateId}
                        onChange={(v) => setForm({ ...form, salaryTemplateId: v })}
                        placeholder="Select template (optional — can be added later)"
                        searchable
                        options={(salaryTemplates?.data ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
                      />
                      <p className="mt-1 text-[11px] text-gray-400">Optional — leave blank to assign salary later via Payroll &rarr; Employee Salaries.</p>
                    </>
                  )}
                </Field>
                <Field label="CTC (LPA)" required={!!form.salaryTemplateId}>
                  <NumberInput
                    min={0}
                    value={form.ctcLpa}
                    onChange={(v) => setForm({ ...form, ctcLpa: v })}
                    placeholder="e.g. 12.5"
                    disabled={!form.salaryTemplateId}
                    className={inputCls}
                  />
                </Field>
                {form.salaryTemplateId && (() => {
                  const selectedTemplate = (salaryTemplates?.data ?? []).find((s) => s.id === form.salaryTemplateId);
                  if (!selectedTemplate) return null;
                  return (
                    <div className="col-span-full">
                      <SalaryBreakdown
                        components={selectedTemplate.components ?? []}
                        annualCTC={(form.ctcLpa ?? 0) * 100000}
                      />
                    </div>
                  );
                })()}
                <Field label="Date of Joining" required>
                  <input type="date" required min={new Date().toISOString().slice(0, 10)} value={form.dateOfJoining} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Employment Type">
                  <Select
                    value={form.employmentType}
                    onChange={(v) => setForm({ ...form, employmentType: v as EmploymentType })}
                    options={EMP_TYPES.map((t) => ({ value: t, label: t === "FullTime" ? "Full Time" : t === "PartTime" ? "Part Time" : t }))}
                  />
                </Field>
                <Field label="Work Location Type">
                  <Select
                    value={form.workLocation}
                    onChange={(v) => setForm({ ...form, workLocation: v as WorkLocation })}
                    options={WORK_LOCS.map((w) => ({ value: w, label: w }))}
                  />
                </Field>
                <Field label="Notice Period">
                  <Select
                    value={form.noticePeriodId}
                    onChange={(v) => {
                      const p = noticePeriods.find((n) => n.id === v);
                      setForm({ ...form, noticePeriodId: v, noticePeriodDays: p ? periodToDays(p) : null });
                    }}
                    placeholder={noticePeriods.length ? "Select notice period" : "No notice periods — add in Offboarding"}
                    options={noticePeriods.map((n) => ({ value: n.id, label: `${n.name} (${n.duration} ${n.unit})` }))}
                  />
                </Field>
                <Field label="Previous Experience (months)">
                  <NumberInput allowDecimal={false} value={form.previousExperience} onChange={(v) => setForm({ ...form, previousExperience: v })} className={inputCls} />
                </Field>
              </div>
            </Section>

            <Section
              id="career"
              icon={<GraduationCap size={18} />}
              title="Education *"
              subtitle="At least one entry with school + degree required."
              sectionRef={(el) => { sectionRefs.current.education = el; }}
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
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">Institution <span className="text-red-500">*</span></th>
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">Degree <span className="text-red-500">*</span></th>
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">Field of Study</th>
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">Start Year</th>
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">End Year</th>
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">Percentage / CGPA</th>
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
                        <td className="px-1 py-2"><FormInput placeholder="e.g. 8.5 CGPA or 82%" value={e.grade} onChange={(ev) => updateEducation(i, "grade", ev.target.value)} /></td>
                        <td className="px-1 py-2 text-center">
                          {form.educations.length > 1 && (
                            <button type="button" onClick={() => removeEducation(i)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50">
                              <Trash2 size={12} />
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
              id="career"
              icon={<History size={18} />}
              title="Career History (Topgrading)"
              subtitle="For each role capture accomplishments, compensation, reason for leaving and the boss appraisal."
              sectionRef={(el) => { sectionRefs.current.experience = el; }}
              action={
                <button type="button" onClick={addExperience} className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534] hover:underline">
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
                <button type="button" onClick={addExperience} className="flex items-center gap-1.5 text-xs text-[#22c55e] hover:underline">
                  <Plus size={14} /> Add another role
                </button>
              </div>
            </Section>

            <Section
              id="contacts"
              icon={<Users size={18} />}
              title="Family Details"
              subtitle="Spouse, children, parents and dependents."
              sectionRef={(el) => { sectionRefs.current.family = el; }}
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
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">Name</th>
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">Relation</th>
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">Date of Birth</th>
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">Occupation</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {form.familyMembers.map((m, i) => (
                      <tr key={i}>
                        <td className="px-1 py-2"><FormInput value={m.name} onChange={(ev) => updateFamilyMember(i, "name", ev.target.value)} /></td>
                        <td className="px-1 py-2">
                          <Select
                            value={m.relation}
                            onChange={(v) => updateFamilyMember(i, "relation", v)}
                            placeholder="Select"
                            size="sm"
                            className="w-full"
                            options={FAMILY_RELATIONS.map((r) => ({ value: r, label: r }))}
                          />
                        </td>
                        <td className="px-1 py-2"><FormInput type="date" value={m.dob} onChange={(ev) => updateFamilyMember(i, "dob", ev.target.value)} /></td>
                        <td className="px-1 py-2"><FormInput value={m.occupation} onChange={(ev) => updateFamilyMember(i, "occupation", ev.target.value)} /></td>
                        <td className="px-1 py-2 text-center">
                          {form.familyMembers.length > 1 && (
                            <button type="button" onClick={() => removeFamilyMember(i)} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50">
                              <Trash2 size={12} />
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
              id="career"
              icon={<Award size={18} />}
              title="Certifications"
              subtitle="Professional courses, certificates and credentials."
              sectionRef={(el) => { sectionRefs.current.certifications = el; }}
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
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">Name</th>
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">Course Name</th>
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">Issuing Authority</th>
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">Year</th>
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">Expiry</th>
                      <th className="text-left px-2 py-2 text-[11px] font-semibold">Credential URL</th>
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
                              <Trash2 size={12} />
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
              id="personal"
              icon={<ShieldCheck size={18} />}
              title="Identity *"
              subtitle="PAN and Aadhaar mandatory."
              sectionRef={(el) => { sectionRefs.current.identity = el; }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4">
                <Field label="PAN Number" required>
                  <IconInput icon={<IdCard size={14} />}>
                    <input required placeholder="Enter PAN number" value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase() })} className={`${inputCls} font-mono text-sm`} maxLength={10} />
                  </IconInput>
                </Field>
                <Field label="Aadhaar Number" required>
                  <IconInput icon={<IdCard size={14} />}>
                    <input required inputMode="numeric" placeholder="Enter Aadhaar number" value={form.aadhaarNumber} onChange={(e) => setForm({ ...form, aadhaarNumber: sanitizeDigits(e.target.value) })} className={`${inputCls} font-mono tracking-widest text-sm`} maxLength={12} />
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
              id="employment"
              icon={<Banknote size={18} />}
              title="Bank Details *"
              subtitle="Bank name, account number and IFSC are mandatory."
              sectionRef={(el) => { sectionRefs.current.bank = el; }}
            >
              <BankDetailsFields
                markRequired
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
              <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-xs">
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
            </StepPanels>

            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2">
              <button
                type="button"
                onClick={goBack}
                disabled={isFirstStep}
                className="btn btn-secondary disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={13} /> Back
              </button>
              <div className="flex-1" />
              <Link href="/org-chart" className="btn btn-secondary">Cancel</Link>
              {isLastStep ? (
                <button
                  type="submit"
                  disabled={createMut.isPending}
                  className="btn btn-primary"
                >
                  <Save size={13} /> {createMut.isPending ? "Saving..." : "Create Employee"}
                </button>
              ) : (
                <button type="button" onClick={goNext} className="btn btn-primary">
                  Next <ChevronRight size={13} />
                </button>
              )}
            </div>
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

function IconInput({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10">{icon}</span>
      <div className="[&>input]:!pl-9">{children}</div>
    </div>
  );
}

// Wizard container — renders only the panel whose child <Section id> matches the
// active step; the rest stay unmounted so we show one step at a time.
function StepPanels({ active, children }: { active: StepId; children: React.ReactNode }) {
  return (
    <>
      {Children.map(children, (child) => {
        if (!isValidElement(child)) return null;
        const id = (child.props as { id?: StepId }).id;
        return id === active ? child : null;
      })}
    </>
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
    <section ref={sectionRef} data-step-id={id} className="surface-card p-4">
      <div className="flex items-start gap-2.5 mb-4 pb-4 border-b border-gray-100">
        <div className="w-9 h-9 rounded-xl bg-[#166534]/5 text-[#166534] flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1">
          <h2 className="text-[13px] font-semibold text-gray-900 leading-tight">
            {title.endsWith(" *") ? (<>{title.slice(0, -2)} <span className="text-red-500">*</span></>) : title}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function AddressBlock({
  value, onChange, required = false,
}: {
  value: Address;
  onChange: (key: keyof Address, v: string) => void;
  required?: boolean;
}) {
  const api = useApiClient();
  // Enter a 6-digit PIN → auto-fill City / State / Country from India Post.
  const onPin = (raw: string) => {
    const pin = raw.replace(/\D/g, "").slice(0, 6);
    onChange("postalCode", pin);
    if (pin.length !== 6) return;
    api.get<{ city: string; state: string; country: string }>(`/api/v1/hrms/util/pincode?pin=${pin}`)
      .then((res) => {
        const d = res.data;
        if (!d) return;
        onChange("city", d.city);
        onChange("state", d.state);
        onChange("country", d.country === "India" ? "IN" : d.country || "IN");
      })
      .catch(() => { /* leave fields as-is on lookup failure */ });
  };
  // When `required`, show labels with a red asterisk on the mandatory fields.
  const Lbl = ({ text, star }: { text: string; star?: boolean }) =>
    required ? (
      <label className="block text-xs font-medium text-gray-800 mb-1.5">
        {text} {star && <span className="text-red-500">*</span>}
      </label>
    ) : null;

  return (
    <div className="grid grid-cols-6 gap-3">
      <div className="col-span-3">
        <Lbl text="Address Line 1" star />
        <FormInput placeholder="Address line 1" value={value.line1} onChange={(e) => onChange("line1", e.target.value)} />
      </div>
      <div className="col-span-3">
        <Lbl text="Address Line 2" />
        <FormInput placeholder="Address line 2" value={value.line2} onChange={(e) => onChange("line2", e.target.value)} />
      </div>
      <div className="col-span-2">
        <Lbl text="City" star />
        <FormInput placeholder="City" value={value.city} onChange={(e) => {
          const city = e.target.value;
          onChange("city", city);
          // Auto-fill Country + State when a known Indian city is entered.
          const st = CITY_STATE.get(city.trim().toLowerCase());
          if (st) { onChange("country", "IN"); onChange("state", st); }
        }} />
      </div>
      <div className="col-span-2">
        <Lbl text="Country" star />
        <Select value={value.country} onChange={(v) => onChange("country", v)} placeholder="Country" options={COUNTRY_OPTS} />
      </div>
      <div className="col-span-2">
        <Lbl text="State" star />
        <Select value={value.state} onChange={(v) => onChange("state", v)} placeholder="State" searchable options={STATE_OPTS} />
      </div>
      <div className="col-span-2">
        <Lbl text="Postal Code" star />
        <FormInput placeholder="6-digit PIN — auto-fills city/state" inputMode="numeric" maxLength={6} value={value.postalCode} onChange={(e) => onPin(e.target.value)} />
      </div>
    </div>
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

// Topgrading career-history card — one expandable role with structured depth.
function ExperienceCard({ index, exp, canRemove, onChange, onRemove }: {
  index: number;
  exp: Experience;
  canRemove: boolean;
  onChange: (key: keyof Experience, v: string | boolean) => void;
  onRemove: () => void;
}) {
  const ta = `${inputCls} min-h-[60px] resize-y`;
  // Past employment can't start/end in the future — cap month pickers at the
  // current month (local).
  const currentMonth = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/40 relative">
      {canRemove && (
        <button type="button" onClick={onRemove} className="absolute top-2 right-2 text-gray-400 hover:text-red-500" aria-label="Remove role">
          <Trash2 size={12} />
        </button>
      )}
      <div className="text-xs font-semibold text-gray-500 uppercase mb-3">
        {index === 0 ? "Most recent role" : `Role ${index + 1}`}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4">
        <Field label="Company"><input value={exp.company} onChange={(e) => onChange("company", e.target.value)} placeholder="Company name" className={inputCls} /></Field>
        <Field label="Title / Position"><input value={exp.designation} onChange={(e) => onChange("designation", e.target.value)} placeholder="e.g. Senior Engineer" className={inputCls} /></Field>

        <Field label="From"><input type="month" max={currentMonth} value={exp.startDate} onChange={(e) => { if (!e.target.value || e.target.value <= currentMonth) onChange("startDate", e.target.value); }} className={inputCls} /></Field>
        <Field label="To">
          <input type="month" min={exp.startDate || undefined} max={currentMonth} value={exp.endDate} disabled={exp.currentlyWorkHere} onChange={(e) => { if (!e.target.value || e.target.value <= currentMonth) onChange("endDate", e.target.value); }} className={clsx(inputCls, exp.currentlyWorkHere && "opacity-50")} />
          <label className="mt-1.5 flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={exp.currentlyWorkHere} onChange={(e) => onChange("currentlyWorkHere", e.target.checked)} className="rounded text-[#22c55e]" />
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

    </div>
  );
}

function ReviewRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-400">{icon}</span>
      <span className="text-xs text-gray-500 w-40 shrink-0">{label}</span>
      <span className="text-xs font-medium text-gray-900 truncate">{value}</span>
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
