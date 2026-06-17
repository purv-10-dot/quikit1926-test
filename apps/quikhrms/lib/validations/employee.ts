import { z } from "zod";

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  country: z.string().min(1),
  zipCode: z.string().min(1),
});

const emergencyContactSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
});

const educationSchema = z.object({
  degree: z.string().min(1),
  institution: z.string().min(1),
  fieldOfStudy: z.string().optional(),
  // Optional — the Add Employee form requires only institution + degree per
  // entry (years are captured when known).
  startYear: z.number().int().optional(),
  endYear: z.number().int().optional(),
  grade: z.string().optional(),
  attachmentUrl: z.string().url().optional(),
});

// Topgrading-style career history. Fields are optional so a partial role never
// blocks employee creation; the UI filters out empty rows before sending.
const pastExperienceSchema = z.object({
  company: z.string().optional(),
  designation: z.string().optional(), // Title / position
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  currentlyWorkHere: z.boolean().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  // Topgrading additions
  startCompensation: z.string().optional(),
  endCompensation: z.string().optional(),
  responsibilities: z.string().optional(),
  accomplishments: z.string().optional(),
  challenges: z.string().optional(),
  reasonForLeaving: z.string().optional(),
  supervisorName: z.string().optional(),
  supervisorTitle: z.string().optional(),
  bossStrengths: z.string().optional(),
  bossWeaknesses: z.string().optional(),
});

const identityDocumentSchema = z.object({
  type: z.enum([
    "PAN", "Aadhaar", "Passport", "DrivingLicense", "VoterID",
    "SSN", "WorkPermit", "Visa", "Custom",
  ]),
  number: z.string().min(1),
  expiryDate: z.string().optional(),
  attachmentUrl: z.string().url().optional(),
  isVerified: z.boolean().default(false),
});

const bankAccountSchema = z.object({
  bankName: z.string().min(1),
  accountNumber: z.string().min(1),
  ifscCode: z.string().optional(),
  branchName: z.string().optional(),
  accountType: z.enum(["Savings", "Current", "Salary", "NRE", "NRO"]).optional(),
  isPrimary: z.boolean().default(false),
});

const skillSchema = z.object({
  name: z.string().min(1),
  proficiency: z.enum(["Beginner", "Intermediate", "Advanced", "Expert"]),
  endorsements: z.number().int().default(0),
});

const certificationSchema = z.object({
  name: z.string().min(1),
  courseName: z.string().optional(),
  issuingBody: z.string().min(1),
  issueDate: z.string(),
  year: z.string().optional(),
  expiryDate: z.string().optional(),
  credentialUrl: z.string().url().optional(),
  attachmentUrl: z.string().url().optional(),
});

const languageSchema = z.object({
  language: z.string().min(1),
  proficiency: z.enum(["Basic", "Conversational", "Fluent", "Native"]),
});

const employeeBaseSchema = z.object({
  firstName: z.string().min(1, "First name required"),
  middleName: z.string().optional(),
  lastName: z.string().min(1, "Last name required"),
  displayName: z.string().optional(),
  gender: z.enum(["Male", "Female", "NonBinary", "PreferNotToSay"]).optional(),
  dateOfBirth: z.string().optional(),
  bloodGroup: z.enum([
    "APositive", "ANegative", "BPositive", "BNegative",
    "ABPositive", "ABNegative", "OPositive", "ONegative",
  ]).optional(),
  maritalStatus: z.enum(["Single", "Married", "Divorced", "Widowed"]).optional(),
  nationality: z.string().optional(),
  isHandicapped: z.boolean().optional(),
  isSeniorCitizen: z.boolean().optional(),
  // Statutory applicability overrides — default true at DB; pass false to exclude.
  epfApplicable: z.boolean().optional(),
  esiApplicable: z.boolean().optional(),
  ptApplicable: z.boolean().optional(),
  epfContributionRate: z.enum(["TwelvePercentActual", "TwelvePercentRestricted"]).nullable().optional(),
  profilePhoto: z.string().optional().nullable().refine(
    (v) => !v || /^https?:\/\//.test(v) || v.startsWith("/"),
    { message: "Must be absolute URL or relative path" },
  ),
  coverImage: z.string().optional().nullable().refine(
    (v) => !v || /^https?:\/\//.test(v) || v.startsWith("/"),
    { message: "Must be absolute URL or relative path" },
  ),
  bio: z.string().optional(),

  personalEmail: z.string().email().optional(),
  workEmail: z.string().email("Valid work email required"),
  personalPhone: z.string().optional(),
  workPhone: z.string().optional(),
  linkedinUrl: z.string().url().optional(),
  githubUrl: z.string().url().optional(),
  portfolioUrl: z.string().url().optional(),

  currentAddress: addressSchema.optional(),
  permanentAddress: addressSchema.optional(),
  emergencyContacts: z.array(emergencyContactSchema).optional(),

  jobTitle: z.string().optional(),
  departmentId: z.string().optional(),
  teamId: z.string().optional(),
  designationId: z.string().optional(),
  gradeId: z.string().optional(),
  reportingManagerId: z.string().min(1, "Reporting manager required"),
  dottedLineManagerId: z.string().optional(),
  employmentType: z.enum(["FullTime", "PartTime", "Contract", "Intern", "Freelancer", "Consultant"]).default("FullTime"),
  workerType: z.enum(["Permanent", "Temporary", "Probation", "Notice"]).default("Permanent"),
  workLocation: z.enum(["Office", "Remote", "Hybrid"]).default("Office"),
  officeLocationId: z.string().optional(),
  dateOfJoining: z.string().min(1, "Date of joining required"),
  confirmationDate: z.string().optional(),
  probationEndDate: z.string().optional(),
  noticePeriodDays: z.number().int().default(0),
  previousExperience: z.number().int().default(0),
  sourceOfHire: z.enum(["Referral", "JobPortal", "LinkedIn", "Agency", "Campus", "Direct", "Other"]).optional(),
  referredById: z.string().optional(),

  identityDocuments: z.array(identityDocumentSchema).optional(),
  bankAccounts: z.array(bankAccountSchema).optional(),
  panNumber: z.string().optional(),
  aadhaarNumber: z.string().optional(),
  taxIdentificationNumber: z.string().optional(),

  skills: z.array(skillSchema).optional(),
  certifications: z.array(certificationSchema).optional(),
  languages: z.array(languageSchema).optional(),
  educations: z.array(educationSchema).optional(),
  pastExperiences: z.array(pastExperienceSchema).optional(),

  customFields: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["PreBoarding", "Active", "OnLeave", "OnNotice", "Suspended", "Relieved", "Absconding"]).default("Active"),
  roleId: z.string().min(1, "Role required"),

  // Initial salary assignment — required on create so onboarded employees always have a salary.
  salaryTemplateId: z.string().min(1, "Salary template required"),
  ctcLpa: z.number().positive("CTC (LPA) required"),

  // When true, send a portal-access invite (account-setup email) instead of the
  // informational welcome email. Decided via the popup on the Add Employee form.
  sendInvite: z.boolean().optional(),
});

export const createEmployeeSchema = employeeBaseSchema;

export const updateEmployeeSchema = employeeBaseSchema.partial().omit({
  workEmail: true,
  dateOfJoining: true,
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
