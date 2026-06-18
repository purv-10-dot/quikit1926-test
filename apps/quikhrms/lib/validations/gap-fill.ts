import { z } from "zod";

// ─── Time Logs ──────────────────────────────────────────

export const TimeLogStatusEnum = z.enum(["LogDraft", "LogSubmitted", "LogApproved", "LogRejected"]);

export const createTimeLogSchema = z.object({
  date: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().optional().nullable(),
  duration: z.number().min(0).default(0),
  projectId: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
  description: z.string().optional(),
  isBillable: z.boolean().default(false),
});

export const updateTimeLogSchema = createTimeLogSchema.partial();

// ─── Timesheets ─────────────────────────────────────────

export const TimesheetPeriodTypeEnum = z.enum(["Weekly", "BiWeekly", "Monthly"]);
export const TimesheetStatusEnum = z.enum(["TsDraft", "TsSubmitted", "TsApproved", "TsRejected"]);

export const createTimesheetSchema = z.object({
  periodType: TimesheetPeriodTypeEnum.default("Weekly"),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  logIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const approveTimesheetSchema = z.object({
  action: z.enum(["Approve", "Reject"]),
  rejectionReason: z.string().optional(),
});

// ─── Delegation ─────────────────────────────────────────

export const DelegationTypeEnum = z.enum(["DelegationTemporary", "DelegationPermanent"]);
export const DelegationNotifyModeEnum = z.enum(["NotifyBoth", "NotifyDelegatee"]);

export const createDelegationSchema = z.object({
  delegateeId: z.string().min(1),
  type: DelegationTypeEnum.default("DelegationTemporary"),
  modules: z.array(z.enum(["Leave", "Expense", "Timesheet", "Attendance", "Recruitment"])).min(1),
  fromDate: z.string().min(1),
  toDate: z.string().optional().nullable(),
  notifyMode: DelegationNotifyModeEnum.default("NotifyBoth"),
  description: z.string().optional(),
}).refine(
  (v) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return new Date(v.fromDate) >= today;
  },
  { path: ["fromDate"], message: "From date cannot be in the past" },
).refine(
  (v) => !v.toDate || new Date(v.toDate) > new Date(v.fromDate),
  { path: ["toDate"], message: "To date must be after From date" },
);

export const updateDelegationSchema = z.object({
  isActive: z.boolean().optional(),
  toDate: z.string().optional().nullable(),
  description: z.string().optional(),
});

// ─── Bulk Employee Import ───────────────────────────────

export const bulkEmployeeRowSchema = z.object({
  employeeCode: z.string().optional(),
  firstName: z.string().min(1),
  middleName: z.string().optional(),
  lastName: z.string().min(1),
  workEmail: z.string().email("Invalid work email").optional().nullable(),
  personalEmail: z.string().email("Invalid personal email").optional().nullable(),
  workPhone: z.string().optional().nullable(),
  personalPhone: z.string().optional().nullable(),
  departmentCode: z.string().optional(),
  departmentName: z.string().optional(),
  designation: z.string().optional(),
  team: z.string().optional(),
  grade: z.string().optional(),
  dateOfJoining: z.string().optional(),
  dateOfBirth: z.string().optional(),
  confirmationDate: z.string().optional(),
  probationEndDate: z.string().optional(),
  lastWorkingDate: z.string().optional(),
  tentativeJoiningDate: z.string().optional(),
  employmentType: z.string().optional(),
  workerType: z.string().optional(),
  workLocation: z.string().optional(),
  officeLocation: z.string().optional(),
  jobTitle: z.string().optional(),
  panNumber: z.string().optional(),
  aadhaarNumber: z.string().optional(),
  gender: z.string().optional(),
  maritalStatus: z.string().optional(),
  bloodGroup: z.string().optional(),
  nationality: z.string().optional(),
  sourceOfHire: z.string().optional(),
  noticePeriodDays: z.string().optional(),
  previousExperience: z.string().optional(),
  // Address (current)
  currentAddressLine1: z.string().optional(),
  currentAddressLine2: z.string().optional(),
  currentCity: z.string().optional(),
  currentState: z.string().optional(),
  currentZip: z.string().optional(),
  currentCountry: z.string().optional(),
  // Address (permanent)
  permanentAddressLine1: z.string().optional(),
  permanentAddressLine2: z.string().optional(),
  permanentCity: z.string().optional(),
  permanentState: z.string().optional(),
  permanentZip: z.string().optional(),
  permanentCountry: z.string().optional(),
  // Emergency contact (single primary)
  emergencyContactName: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactEmail: z.string().optional(),
  // Bank
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankIfsc: z.string().optional(),
  bankAccountHolder: z.string().optional(),
  // Reporting manager (lookup by code)
  reportingManagerCode: z.string().optional(),
  dottedLineManagerCode: z.string().optional(),
  // Statutory
  uanNumber: z.string().optional(),
  pfAccountNumber: z.string().optional(),
  esiNumber: z.string().optional(),
  taxIdentificationNumber: z.string().optional(),
  // Education / Skills
  highestQualification: z.string().optional(),
  skillSet: z.string().optional(),
  // Salary
  currentSalary: z.string().optional(),
  expectedSalary: z.string().optional(),
  // Profile
  profilePhoto: z.string().optional(),
  bio: z.string().optional(),
  linkedinUrl: z.string().optional(),
  // Nested sub-sheet arrays (multi-sheet upload)
  educations: z.array(z.object({
    level: z.string().optional(),
    institution: z.string().optional(),
    degree: z.string().optional(),
    fieldOfStudy: z.string().optional(),
    year: z.string().optional(),
    grade: z.string().optional(),
  })).optional(),
  certifications: z.array(z.object({
    name: z.string().optional(),
    courseName: z.string().optional(),
    issuingAuthority: z.string().optional(),
    year: z.string().optional(),
    expiryDate: z.string().optional(),
    credentialUrl: z.string().optional(),
  })).optional(),
  pastExperiences: z.array(z.object({
    company: z.string().optional(),
    jobTitle: z.string().optional(),
    totalExperience: z.string().optional(),
    lastWorkingDate: z.string().optional(),
    skills: z.string().optional(),
  })).optional(),
  familyMembers: z.array(z.object({
    name: z.string().optional(),
    relation: z.string().optional(),
    dob: z.string().optional(),
    occupation: z.string().optional(),
  })).optional(),
  childrenDetails: z.array(z.object({
    name: z.string().optional(),
    dob: z.string().optional(),
    gender: z.string().optional(),
  })).optional(),
  extraEmergencyContacts: z.array(z.object({
    name: z.string().optional(),
    relationship: z.string().optional(),
    phone: z.string().optional(),
    alternatePhone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
  })).optional(),
  extraBankAccounts: z.array(z.object({
    bankName: z.string().optional(),
    branchName: z.string().optional(),
    accountNumber: z.string().optional(),
    accountHolder: z.string().optional(),
    ifscCode: z.string().optional(),
    accountType: z.string().optional(),
  })).optional(),
});

/**
 * Max rows accepted in a single bulk upload (employees + invitations).
 * Each row fans out to a background job / central provisioning call, so we cap
 * a single upload to keep one request's blast radius small — users split a
 * large roster into batches of this size. Tune here; both bulk endpoints read
 * the same limit.
 */
export const MAX_BULK_UPLOAD_ROWS = 50;

export const bulkImportEmployeesSchema = z.object({
  fileName: z.string().min(1),
  rows: z
    .array(bulkEmployeeRowSchema)
    .min(1, "No rows found")
    .max(MAX_BULK_UPLOAD_ROWS, `You can upload at most ${MAX_BULK_UPLOAD_ROWS} employees at a time`),
  dryRun: z.boolean().default(false),
  markActive: z.boolean().default(false),
});

// ─── Employment History ─────────────────────────────────

export const EmploymentChangeTypeEnum = z.enum([
  "Promotion", "Transfer", "RoleChange", "SalaryChange", "ConfirmationChange",
  "EmpStatusChange", "DepartmentChange", "ManagerChange",
]);

export const createEmploymentHistorySchema = z.object({
  employeeId: z.string().min(1),
  changeType: EmploymentChangeTypeEnum,
  fromValue: z.record(z.string(), z.unknown()).optional(),
  toValue: z.record(z.string(), z.unknown()),
  effectiveDate: z.string().min(1),
  reason: z.string().optional(),
  letterUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

// ─── AI Copilot ─────────────────────────────────────────

export const AIScopeEnum = z.enum([
  "HRChat", "LeaveAssistant", "PayslipExplainer", "PolicyQA", "ResumeScreening", "DocumentAI",
]);

export const aiChatMessageSchema = z.object({
  conversationId: z.string().optional(),
  scope: AIScopeEnum.default("HRChat"),
  message: z.string().min(1).max(4000),
  contextId: z.string().optional(),
});

export const aiInsightRequestSchema = z.object({
  scope: AIScopeEnum,
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
});

// ─── E-Sign ─────────────────────────────────────────────

export const ESignProviderEnum = z.enum(["Internal", "DocuSign", "AdobeSign", "LeegalityProvider"]);

export const createESignRequestSchema = z.object({
  documentId: z.string().optional().nullable(),
  title: z.string().min(1),
  provider: ESignProviderEnum.default("Internal"),
  signers: z.array(z.object({
    name: z.string().min(1),
    email: z.string().email(),
    role: z.string().optional(),
    order: z.number().int().min(1).default(1),
  })).min(1),
  message: z.string().optional(),
  expiresAt: z.string().optional().nullable(),
});

export const signESignSchema = z.object({
  signerEmail: z.string().email(),
  signatureBase64: z.string().min(1),
  decline: z.boolean().default(false),
});

// ─── Candidate Portal ───────────────────────────────────

export const issuePortalAccessSchema = z.object({
  candidateId: z.string().min(1),
  expiresInDays: z.number().int().min(1).max(365).default(90),
});

export const portalLoginSchema = z.object({
  token: z.string().min(1),
});
