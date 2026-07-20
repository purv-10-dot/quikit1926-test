/**
 * Canonical employee CSV/Excel export columns — one source of truth so every
 * employee download (People directory, Org chart, …) emits the SAME complete
 * set of columns, mirroring the Add/Edit Employee form. Built on the shared
 * csv.ts helpers (see the HRMS CSV export standard).
 *
 * Feed it rows fetched with `?fields=full` from GET /employees so every scalar
 * and JSON field is present; missing fields simply render as empty cells.
 */
import { type CsvColumn, fmtDate, formatAddress, formatGroup } from "@/lib/utils/csv";

interface AddressJson { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; country?: string | null; postalCode?: string | null }
interface EmergencyContactJson { name?: string | null; relationship?: string | null; phone?: string | null; email?: string | null; address?: string | null }
interface EducationJson { schoolName?: string | null; degree?: string | null; fieldOfStudy?: string | null; completionDate?: string | null; notes?: string | null }
interface ExperienceJson { occupation?: string | null; company?: string | null; summary?: string | null; duration?: string | null; currentlyWorkHere?: boolean | null }
interface CertificationJson { name?: string | null; courseName?: string | null; issuingAuthority?: string | null; year?: string | null; expiryDate?: string | null; credentialUrl?: string | null }

/** The full employee shape an export row may carry (all optional — `fields=full`). */
export interface EmployeeExportRow {
  employeeCode?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  bloodGroup?: string | null;
  maritalStatus?: string | null;
  nationality?: string | null;
  isHandicapped?: boolean | null;
  isSeniorCitizen?: boolean | null;
  workEmail?: string | null;
  personalEmail?: string | null;
  personalPhone?: string | null;
  workPhone?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
  currentAddress?: AddressJson | null;
  permanentAddress?: AddressJson | null;
  emergencyContacts?: EmergencyContactJson[] | null;
  department?: { name?: string | null } | null;
  designation?: { title?: string | null } | null;
  jobTitle?: string | null;
  team?: { name?: string | null } | null;
  grade?: { name?: string | null } | null;
  role?: { name?: string | null } | null;
  roleId?: string | null;
  reportingManager?: { firstName?: string | null; lastName?: string | null } | null;
  employmentType?: string | null;
  workerType?: string | null;
  workLocation?: string | null;
  officeLocation?: { name?: string | null } | null;
  status?: string | null;
  dateOfJoining?: string | null;
  confirmationDate?: string | null;
  probationEndDate?: string | null;
  tentativeJoiningDate?: string | null;
  lastWorkingDate?: string | null;
  noticePeriodDays?: number | null;
  previousExperience?: number | null;
  sourceOfHire?: string | null;
  currentSalary?: number | string | null;
  expectedSalary?: number | string | null;
  offerLetterUrl?: string | null;
  highestQualification?: string | null;
  skillSet?: string | null;
  skills?: unknown;
  languages?: unknown;
  additionalInfo?: string | null;
  educations?: EducationJson[] | null;
  pastExperiences?: ExperienceJson[] | null;
  certifications?: CertificationJson[] | null;
  panNumber?: string | null;
  aadhaarNumber?: string | null;
  taxIdentificationNumber?: string | null;
  uanNumber?: string | null;
  pfAccountNumber?: string | null;
  esiNumber?: string | null;
  epfApplicable?: boolean | null;
  esiApplicable?: boolean | null;
  ptApplicable?: boolean | null;
  customFields?: unknown;
}

/** Join primitive arrays with "; "; JSON-stringify richer values; else String(). */
function loose(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) {
    if (v.length === 0) return "";
    return v.every((x) => typeof x === "string" || typeof x === "number") ? v.join("; ") : JSON.stringify(v);
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export const EMPLOYEE_EXPORT_COLUMNS: CsvColumn<EmployeeExportRow>[] = [
  { header: "Employee Code", value: (e) => e.employeeCode },
  { header: "First Name", value: (e) => e.firstName },
  { header: "Middle Name", value: (e) => e.middleName },
  { header: "Last Name", value: (e) => e.lastName },
  { header: "Display Name", value: (e) => e.displayName ?? [e.firstName, e.lastName].filter(Boolean).join(" ") },
  { header: "Gender", value: (e) => e.gender },
  { header: "Date of Birth", value: (e) => fmtDate(e.dateOfBirth) },
  { header: "Blood Group", value: (e) => e.bloodGroup },
  { header: "Marital Status", value: (e) => e.maritalStatus },
  { header: "Nationality", value: (e) => e.nationality },
  { header: "Handicapped", value: (e) => e.isHandicapped },
  { header: "Senior Citizen", value: (e) => e.isSeniorCitizen },
  { header: "Work Email", value: (e) => e.workEmail },
  { header: "Personal Email", value: (e) => e.personalEmail },
  { header: "Personal Phone", value: (e) => e.personalPhone },
  { header: "Work Phone", value: (e) => e.workPhone },
  { header: "LinkedIn", value: (e) => e.linkedinUrl },
  { header: "GitHub", value: (e) => e.githubUrl },
  { header: "Portfolio", value: (e) => e.portfolioUrl },
  { header: "Current Address", value: (e) => formatAddress(e.currentAddress) },
  { header: "Permanent Address", value: (e) => formatAddress(e.permanentAddress) },
  { header: "Emergency Contacts", value: (e) => formatGroup(e.emergencyContacts, (x) => `${x.name ?? ""}${x.relationship ? ` (${x.relationship})` : ""}${x.phone ? ` ${x.phone}` : ""}${x.email ? ` ${x.email}` : ""}`) },
  { header: "Department", value: (e) => e.department?.name },
  { header: "Designation", value: (e) => e.designation?.title },
  { header: "Job Title", value: (e) => e.jobTitle ?? e.designation?.title },
  { header: "Team", value: (e) => e.team?.name },
  { header: "Grade", value: (e) => e.grade?.name },
  { header: "Role", value: (e) => e.role?.name },
  { header: "Reports To", value: (e) => (e.reportingManager ? `${e.reportingManager.firstName ?? ""} ${e.reportingManager.lastName ?? ""}`.trim() : "") },
  { header: "Employment Type", value: (e) => e.employmentType },
  { header: "Worker Type", value: (e) => e.workerType },
  { header: "Work Location", value: (e) => e.workLocation },
  { header: "Office Location", value: (e) => e.officeLocation?.name },
  { header: "Status", value: (e) => e.status },
  { header: "Date of Joining", value: (e) => fmtDate(e.dateOfJoining) },
  { header: "Confirmation Date", value: (e) => fmtDate(e.confirmationDate) },
  { header: "Probation End Date", value: (e) => fmtDate(e.probationEndDate) },
  { header: "Tentative Joining Date", value: (e) => fmtDate(e.tentativeJoiningDate) },
  { header: "Last Working Date", value: (e) => fmtDate(e.lastWorkingDate) },
  { header: "Notice Period (days)", value: (e) => e.noticePeriodDays },
  { header: "Previous Experience (months)", value: (e) => e.previousExperience },
  { header: "Source of Hire", value: (e) => e.sourceOfHire },
  { header: "Current Salary", value: (e) => e.currentSalary },
  { header: "Expected Salary", value: (e) => e.expectedSalary },
  { header: "Offer Letter URL", value: (e) => e.offerLetterUrl },
  { header: "Highest Qualification", value: (e) => e.highestQualification },
  { header: "Skill Set", value: (e) => e.skillSet },
  { header: "Skills", value: (e) => loose(e.skills) },
  { header: "Languages", value: (e) => loose(e.languages) },
  { header: "Additional Info", value: (e) => e.additionalInfo },
  { header: "Education", value: (e) => formatGroup(e.educations, (x) => `${x.degree ?? ""}${x.fieldOfStudy ? ` ${x.fieldOfStudy}` : ""}${x.schoolName ? `, ${x.schoolName}` : ""}${x.completionDate ? ` (${fmtDate(x.completionDate)})` : ""}`) },
  { header: "Past Experience", value: (e) => formatGroup(e.pastExperiences, (x) => `${x.occupation ?? ""}${x.company ? ` @ ${x.company}` : ""}${x.duration ? ` (${x.duration})` : ""}${x.currentlyWorkHere ? " [current]" : ""}`) },
  { header: "Certifications", value: (e) => formatGroup(e.certifications, (x) => `${x.name ?? ""}${x.issuingAuthority ? ` — ${x.issuingAuthority}` : ""}${x.year ? ` (${x.year})` : ""}`) },
  { header: "PAN", value: (e) => e.panNumber },
  { header: "Aadhaar", value: (e) => e.aadhaarNumber },
  { header: "Tax ID (TIN)", value: (e) => e.taxIdentificationNumber },
  { header: "UAN", value: (e) => e.uanNumber },
  { header: "PF Account No", value: (e) => e.pfAccountNumber },
  { header: "ESI No", value: (e) => e.esiNumber },
  { header: "EPF Applicable", value: (e) => e.epfApplicable },
  { header: "ESI Applicable", value: (e) => e.esiApplicable },
  { header: "PT Applicable", value: (e) => e.ptApplicable },
  { header: "Custom Fields", value: (e) => loose(e.customFields) },
];
