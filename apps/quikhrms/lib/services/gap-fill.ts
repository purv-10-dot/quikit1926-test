import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { APP_ID } from "@/lib/rbac/registry";

// ─── Bulk import processor ──────────────────────────────

type BulkEmpRow = {
  employeeCode?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  workEmail?: string | null;
  personalEmail?: string | null;
  workPhone?: string | null;
  personalPhone?: string | null;
  departmentCode?: string;
  departmentName?: string;
  designation?: string;
  team?: string;
  grade?: string;
  dateOfJoining?: string;
  dateOfBirth?: string;
  confirmationDate?: string;
  probationEndDate?: string;
  lastWorkingDate?: string;
  tentativeJoiningDate?: string;
  employmentType?: string;
  workerType?: string;
  workLocation?: string;
  officeLocation?: string;
  jobTitle?: string;
  panNumber?: string;
  aadhaarNumber?: string;
  gender?: string;
  maritalStatus?: string;
  bloodGroup?: string;
  nationality?: string;
  sourceOfHire?: string;
  noticePeriodDays?: string;
  previousExperience?: string;
  currentAddressLine1?: string;
  currentAddressLine2?: string;
  currentCity?: string;
  currentState?: string;
  currentZip?: string;
  currentCountry?: string;
  permanentAddressLine1?: string;
  permanentAddressLine2?: string;
  permanentCity?: string;
  permanentState?: string;
  permanentZip?: string;
  permanentCountry?: string;
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  emergencyContactPhone?: string;
  emergencyContactEmail?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankAccountHolder?: string;
  reportingManagerCode?: string;
  dottedLineManagerCode?: string;
  uanNumber?: string;
  pfAccountNumber?: string;
  esiNumber?: string;
  taxIdentificationNumber?: string;
  highestQualification?: string;
  skillSet?: string;
  currentSalary?: string;
  expectedSalary?: string;
  profilePhoto?: string;
  bio?: string;
  linkedinUrl?: string;
  educations?: Array<{ level?: string; institution?: string; degree?: string; fieldOfStudy?: string; year?: string; grade?: string }>;
  certifications?: Array<{ name?: string; courseName?: string; issuingAuthority?: string; year?: string; expiryDate?: string; credentialUrl?: string }>;
  pastExperiences?: Array<{ company?: string; jobTitle?: string; totalExperience?: string; lastWorkingDate?: string; skills?: string }>;
  familyMembers?: Array<{ name?: string; relation?: string; dob?: string; occupation?: string }>;
  childrenDetails?: Array<{ name?: string; dob?: string; gender?: string }>;
  extraEmergencyContacts?: Array<{ name?: string; relationship?: string; phone?: string; alternatePhone?: string; email?: string; address?: string }>;
  extraBankAccounts?: Array<{ bankName?: string; branchName?: string; accountNumber?: string; accountHolder?: string; ifscCode?: string; accountType?: string }>;
};

const NA_VALUES = new Set(["", "na", "n/a", "none", "null", "-", "—"]);
const isNA = (v: unknown): boolean =>
  typeof v === "string" && NA_VALUES.has(v.trim().toLowerCase());
const clean = (v: string | null | undefined): string | undefined => {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s || isNA(s)) return undefined;
  return s;
};

// Format check removed for bulk import — any non-blank value is accepted
// as-is (previously dropped silently if it failed a basic email regex).
// NOTE: workEmail specifically is used for login/invites/SSO elsewhere in
// HRMS — a malformed one saves fine but that employee can't be invited until
// HR corrects it via Edit Employee.
const cleanEmail = (v: string | null | undefined): string | undefined => clean(v);

const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  "fulltime": "FullTime",
  "full-time": "FullTime",
  "full time": "FullTime",
  "permanent": "FullTime",
  "parttime": "PartTime",
  "part-time": "PartTime",
  "part time": "PartTime",
  "contract": "Contract",
  "contractual": "Contract",
  "intern": "Intern",
  "internship": "Intern",
  // Freelancer / Consultant were removed from EmploymentType — fold into Contract.
  "freelancer": "Contract",
  "freelance": "Contract",
  "consultant": "Contract",
  "consulting": "Contract",
};

const WORKER_TYPE_MAP: Record<string, string> = {
  "permanent": "Permanent",
  "temporary": "Temporary",
  "temp": "Temporary",
  "probation": "Probation",
  "notice": "Notice",
};

const WORK_LOCATION_MAP: Record<string, string> = {
  "office": "Office",
  "onsite": "Office",
  "on-site": "Office",
  "remote": "Remote",
  "wfh": "Remote",
  "work from home": "Remote",
  "hybrid": "Hybrid",
};

const GENDER_MAP: Record<string, string> = {
  "male": "Male",
  "m": "Male",
  "female": "Female",
  "f": "Female",
  "transgender": "Transgender",
  "trans": "Transgender",
  "nonbinary": "NonBinary",
  "non-binary": "NonBinary",
  "preferNotToSay": "PreferNotToSay",
  "prefer not to say": "PreferNotToSay",
  "n/a": "PreferNotToSay",
};

const MARITAL_STATUS_MAP: Record<string, string> = {
  "single": "Single",
  "unmarried": "Single",
  "married": "Married",
  "marrige": "Married",
  "divorced": "Divorced",
  "widowed": "Widowed",
  "widow": "Widowed",
};

const BLOOD_GROUP_MAP: Record<string, string> = {
  "a+": "APositive",
  "a positive": "APositive",
  "a-": "ANegative",
  "a negative": "ANegative",
  "b+": "BPositive",
  "b positive": "BPositive",
  "b-": "BNegative",
  "b negative": "BNegative",
  "ab+": "ABPositive",
  "ab positive": "ABPositive",
  "ab-": "ABNegative",
  "ab negative": "ABNegative",
  "ab": "ABPositive",
  "o+": "OPositive",
  "o positive": "OPositive",
  "o-": "ONegative",
  "o negative": "ONegative",
};

const SOURCE_OF_HIRE_MAP: Record<string, string> = {
  "referral": "Referral",
  "referred": "Referral",
  "jobportal": "JobPortal",
  "job portal": "JobPortal",
  "naukri": "JobPortal",
  "indeed": "JobPortal",
  "linkedin": "LinkedIn",
  "linked in": "LinkedIn",
  "agency": "Agency",
  "consultancy": "Agency",
  "campus": "Campus",
  "college": "Campus",
  "direct": "Direct",
  "walk-in": "Direct",
  "walkin": "Direct",
  "other": "Other",
};

function normalizeEnum(value: string | undefined, map: Record<string, string>, fallback: string): string {
  if (!value) return fallback;
  const k = value.trim().toLowerCase();
  return map[k] ?? fallback;
}

function normalizeEnumOptional(
  value: string | undefined,
  map: Record<string, string>
): string | null {
  if (!value) return null;
  const k = value.trim().toLowerCase();
  return map[k] ?? null;
}

function parseIntLoose(value: string | undefined): number | null {
  if (!value) return null;
  // Strip non-digits ("30 Days" → "30")
  const stripped = value.replace(/[^\d]/g, "");
  if (!stripped) return null;
  const n = parseInt(stripped, 10);
  return isNaN(n) ? null : n;
}

function parseDecimalLoose(value: string | undefined): number | null {
  if (!value) return null;
  const stripped = value.replace(/[^\d.\-]/g, "");
  if (!stripped) return null;
  const n = parseFloat(stripped);
  return isNaN(n) ? null : n;
}

function buildAddress(
  line1: string | undefined,
  line2: string | undefined,
  city: string | undefined,
  state: string | undefined,
  zip: string | undefined,
  country: string | undefined,
): Record<string, string> | null {
  const obj: Record<string, string> = {};
  if (line1) obj.line1 = line1;
  if (line2) obj.line2 = line2;
  if (city) obj.city = city;
  if (state) obj.state = state;
  if (zip) obj.zipCode = zip;
  if (country) obj.country = country;
  return Object.keys(obj).length > 0 ? obj : null;
}

function buildEmergencyContact(
  name: string | undefined,
  relation: string | undefined,
  phone: string | undefined,
  email: string | undefined,
): Array<Record<string, string>> | null {
  const obj: Record<string, string> = {};
  if (name) obj.name = name;
  if (relation) obj.relation = relation;
  if (phone) obj.phone = phone;
  if (email) obj.email = email;
  return Object.keys(obj).length > 0 ? [obj] : null;
}

function buildBankAccount(
  bankName: string | undefined,
  accountNumber: string | undefined,
  ifsc: string | undefined,
  accountHolder: string | undefined,
): Array<Record<string, string>> | null {
  const obj: Record<string, string> = {};
  if (bankName) obj.bankName = bankName;
  if (accountNumber) obj.accountNumber = accountNumber;
  if (ifsc) obj.ifscCode = ifsc;
  if (accountHolder) obj.accountHolder = accountHolder;
  return Object.keys(obj).length > 0 ? [obj] : null;
}

const DATE_DMY_REGEX = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/;

function parseDateLoose(input: string | undefined): Date | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  // Already ISO-like
  const direct = new Date(s);
  if (!isNaN(direct.getTime())) return direct;
  // dd/mm/yyyy or dd-mm-yyyy
  const dmY = DATE_DMY_REGEX.exec(s);
  if (dmY) {
    const day = parseInt(dmY[1], 10);
    const month = parseInt(dmY[2], 10) - 1;
    let year = parseInt(dmY[3], 10);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export interface CreatedEmployeeSummary {
  id: string;
  workEmail: string;
  firstName: string;
  lastName: string;
  roleId: string | null;
}

export async function processBulkEmployees(
  orgId: string, userId: string, rows: BulkEmpRow[], dryRun: boolean, markActive: boolean = false,
): Promise<{
  success: number; failed: number; errors: Array<{ row: number; error: string }>;
  warnings: Array<{ row: number; warning: string }>; createdEmployees: CreatedEmployeeSummary[];
}> {
  const errors: Array<{ row: number; error: string }> = [];
  // Non-blocking notes — the row still imports, but something was silently
  // skipped (e.g. a given-but-unresolvable reporting manager) and HR should
  // know to go fix it, rather than never finding out.
  const warnings: Array<{ row: number; warning: string }> = [];
  const createdEmployees: CreatedEmployeeSummary[] = [];
  let success = 0;

  // Cache lookups: department by code AND name (case-insensitive)
  const depts = await prisma.department.findMany({
    where: { orgId, deletedAt: null }, select: { id: true, code: true, name: true },
  });
  const deptByCode = new Map(depts.map((d) => [d.code.toLowerCase(), d.id]));
  const deptByName = new Map(depts.map((d) => [d.name.toLowerCase(), d.id]));

  // Build manager lookup so reporting manager can be set in same import.
  // Keyed by BOTH employeeCode and email — real-world exports often put the
  // manager's email in this column instead of their EMP ID code, so either
  // one resolves the link. Build/refresh inside loop because earlier rows may
  // add new managers.
  const managerByCode = new Map<string, string>();
  const existingMgrs = await prisma.employee.findMany({
    where: { orgId, deletedAt: null },
    select: { id: true, employeeCode: true, workEmail: true, personalEmail: true },
  });
  for (const e of existingMgrs) {
    managerByCode.set(e.employeeCode.toLowerCase(), e.id);
    if (e.workEmail) managerByCode.set(e.workEmail.toLowerCase(), e.id);
    if (e.personalEmail) managerByCode.set(e.personalEmail.toLowerCase(), e.id);
  }

  // Employee codes/emails this file itself will create. A manager may sit in a
  // LATER row than the people reporting to them, so row order must not decide
  // whether the link resolves — rows are created first, managers linked in a
  // second pass below, and this set lets an up-front check tell "manager
  // comes later in the file" apart from "manager code doesn't exist anywhere"
  // (a typo).
  const codesInFile = new Set(
    rows.flatMap((row) => [
      clean(row.employeeCode)?.toLowerCase(),
      cleanEmail(row.workEmail)?.toLowerCase(),
      cleanEmail(row.personalEmail)?.toLowerCase(),
    ].filter((c): c is string => !!c)),
  );
  // Employees created without a resolvable manager yet — linked after the loop.
  const pendingManagerLinks: Array<{ id: string; code: string; mgrCode: string | null; dotCode: string | null }> = [];

  // Pre-load active employee codes for dryRun-time conflict detection.
  // Work email duplicates are allowed; only employeeCode is enforced unique.
  const existingActive = await prisma.employee.findMany({
    where: { orgId, deletedAt: null },
    select: { id: true, employeeCode: true },
  });
  const activeCodeSet = new Set(existingActive.map((e) => e.employeeCode.toLowerCase()));

  const seenCodesInBatch = new Set<string>();

  const designations = await prisma.designation.findMany({
    where: { orgId, deletedAt: null }, select: { id: true, title: true },
  });
  const designByTitle = new Map(designations.map((d) => [d.title.toLowerCase(), d.id]));

  const officeLocs = await prisma.officeLocation.findMany({
    where: { orgId, deletedAt: null }, select: { id: true, name: true },
  });
  const officeByName = new Map(officeLocs.map((o) => [o.name.toLowerCase(), o.id]));

  const grades = await prisma.grade.findMany({
    where: { orgId, deletedAt: null }, select: { id: true, name: true },
  });
  const gradeByName = new Map(grades.map((g) => [g.name.toLowerCase(), g.id]));

  // Default app role (tenant's isDefault role — "employee") assigned to every
  // imported employee so they have RBAC permissions, mirroring single-create.
  let defaultRoleId: string | null = null;
  if (!dryRun) {
    const defaultRole = await prisma.hrmsAppRole.findFirst({
      where: { orgId: orgId, appId: APP_ID, isDefault: true },
      select: { id: true },
    });
    defaultRoleId = defaultRole?.id ?? null;
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const firstName = clean(r.firstName);
      const lastName = clean(r.lastName);
      if (!firstName || !lastName) {
        errors.push({ row: i + 1, error: "Missing firstName or lastName" });
        continue;
      }

      // Reject rows missing any field that is mandatory in the Add Employee form.
      // Work Location / Office Location / Job Title / Notice Period / Emergency
      // Contact (Name/Relation/Phone) / current-address / PAN / Aadhaar / Bank
      // details were required here too for a while, but that blocked imports
      // whose source file just doesn't carry these columns — they're collected
      // instead of blocked; HR fills them in later via Edit Employee. Format is
      // still enforced when a value IS present (zPanOptional/zAadhaarOptional/
      // zBankAccountOptional/zIfscOptional in bulkEmployeeRowSchema).
      // Department and Employment Type were required here too, but both have a
      // safe blank/default path downstream (departmentId stays null; employmentType
      // falls back to "FullTime" via normalizeEnum below) — so a missing source
      // column no longer blocks the whole row; HR fills them in later via Edit Employee.
      const missingRequired: string[] = [];
      if (!clean(r.workEmail)) missingRequired.push("Work Email");
      if (!clean(r.personalPhone)) missingRequired.push("Personal Phone");
      if (!clean(r.gender)) missingRequired.push("Gender");
      if (!clean(r.dateOfBirth)) missingRequired.push("Date of Birth");
      if (!clean(r.designation)) missingRequired.push("Designation");
      if (!clean(r.dateOfJoining)) missingRequired.push("Date of Joining");
      if (missingRequired.length > 0) {
        errors.push({ row: i + 1, error: `Missing required field(s): ${missingRequired.join(", ")}` });
        continue;
      }
      // Phone format check removed for bulk import (was: exactly 10 digits) —
      // a bad value saves as-is; HR fixes it later via Edit Employee.

      const workEmail = cleanEmail(r.workEmail);
      const personalEmail = cleanEmail(r.personalEmail);
      const effectiveEmail = workEmail ?? personalEmail;
      if (!effectiveEmail) {
        errors.push({
          row: i + 1,
          error: "Missing email — please provide a valid Work Email or Personal Email",
        });
        continue;
      }

      // Reporting manager is optional — HR can set it later via Edit Employee.
      // When given but it doesn't resolve to a real employee (in HRMS already,
      // or another row in this file) by code or email, don't block the whole
      // row over it — import with the manager left blank, but leave a warning
      // so a typo doesn't just silently vanish with no trace.
      const mgrCodeGiven = clean(r.reportingManagerCode);
      if (mgrCodeGiven) {
        const mgrKey = mgrCodeGiven.toLowerCase();
        if (!managerByCode.has(mgrKey) && !codesInFile.has(mgrKey)) {
          warnings.push({
            row: i + 1,
            warning: `Reporting manager ${mgrCodeGiven} not found — imported without a manager, set it manually later`,
          });
        } else {
          const ownCode = clean(r.employeeCode)?.toLowerCase();
          if (mgrKey === ownCode || mgrKey === effectiveEmail.toLowerCase()) {
            errors.push({ row: i + 1, error: `Employee cannot report to themselves (${mgrCodeGiven})` });
            continue;
          }
        }
      }

      // Look up only soft-deleted matches for re-hire restoration.
      const existing = await prisma.employee.findFirst({
        where: { orgId, workEmail: effectiveEmail, deletedAt: { not: null } },
        select: { id: true, deletedAt: true },
      });

      const codeProvided = clean(r.employeeCode);
      if (codeProvided) {
        const codeKey = codeProvided.toLowerCase();
        if (seenCodesInBatch.has(codeKey)) {
          errors.push({ row: i + 1, error: `Duplicate employee code in this file: ${codeProvided}` });
          continue;
        }
        if (activeCodeSet.has(codeKey)) {
          errors.push({ row: i + 1, error: `Employee code already exists in DB: ${codeProvided}` });
          continue;
        }
        seenCodesInBatch.add(codeKey);
      }

      // Department: try code first, then name. Auto-create if name given but no match.
      let departmentId: string | null = null;
      const deptCode = clean(r.departmentCode);
      const deptName = clean(r.departmentName);
      if (deptCode) departmentId = deptByCode.get(deptCode.toLowerCase()) ?? null;
      if (!departmentId && deptName) departmentId = deptByName.get(deptName.toLowerCase()) ?? null;
      if (!departmentId && deptName && !dryRun) {
        const generatedCode = deptName
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 32) || `DEPT_${Date.now()}`;
        const created = await prisma.department.create({
          data: {
            orgId,
            code: generatedCode,
            name: deptName,
            status: "Active",
            createdBy: userId,
            updatedBy: userId,
          },
        });
        departmentId = created.id;
        deptByCode.set(generatedCode.toLowerCase(), created.id);
        deptByName.set(deptName.toLowerCase(), created.id);
      }

      // Designation: lookup by title; auto-create if missing (so import doesn't fail)
      let designationId: string | null = null;
      const desigName = clean(r.designation);
      if (desigName) {
        designationId = designByTitle.get(desigName.toLowerCase()) ?? null;
        if (!designationId && !dryRun) {
          const created = await prisma.designation.create({
            data: { orgId, title: desigName, level: 0, createdBy: userId, updatedBy: userId },
          });
          designationId = created.id;
          designByTitle.set(desigName.toLowerCase(), created.id);
        }
      }

      // Office Location
      let officeLocationId: string | null = null;
      const officeName = clean(r.officeLocation);
      if (officeName) {
        officeLocationId = officeByName.get(officeName.toLowerCase()) ?? null;
        if (!officeLocationId && !dryRun) {
          const created = await prisma.officeLocation.create({
            data: { orgId, name: officeName, createdBy: userId, updatedBy: userId },
          });
          officeLocationId = created.id;
          officeByName.set(officeName.toLowerCase(), created.id);
        }
      }

      // Grade
      let gradeId: string | null = null;
      const gradeName = clean(r.grade);
      if (gradeName) {
        gradeId = gradeByName.get(gradeName.toLowerCase()) ?? null;
        if (!gradeId && !dryRun) {
          const created = await prisma.grade.create({
            data: { orgId, name: gradeName, level: 0, createdBy: userId, updatedBy: userId },
          });
          gradeId = created.id;
          gradeByName.set(gradeName.toLowerCase(), created.id);
        }
      }

      const employmentType = normalizeEnum(clean(r.employmentType), EMPLOYMENT_TYPE_MAP, "FullTime");
      const workerType = normalizeEnum(clean(r.workerType), WORKER_TYPE_MAP, "Permanent");
      const workLocation = normalizeEnum(clean(r.workLocation), WORK_LOCATION_MAP, "Office");

      const gender = normalizeEnumOptional(clean(r.gender), GENDER_MAP);
      const maritalStatus = normalizeEnumOptional(clean(r.maritalStatus), MARITAL_STATUS_MAP);
      const bloodGroup = normalizeEnumOptional(clean(r.bloodGroup), BLOOD_GROUP_MAP);
      const sourceOfHire = normalizeEnumOptional(clean(r.sourceOfHire), SOURCE_OF_HIRE_MAP);

      const dojParsed = parseDateLoose(clean(r.dateOfJoining));
      const dateOfJoining = dojParsed ?? new Date();
      const dateOfBirth = parseDateLoose(clean(r.dateOfBirth));
      const confirmationDate = parseDateLoose(clean(r.confirmationDate));
      const probationEndDate = parseDateLoose(clean(r.probationEndDate));
      const lastWorkingDate = parseDateLoose(clean(r.lastWorkingDate));
      const tentativeJoiningDate = parseDateLoose(clean(r.tentativeJoiningDate));
      const noticePeriodDays = parseIntLoose(clean(r.noticePeriodDays)) ?? 0;
      const previousExperience = parseIntLoose(clean(r.previousExperience)) ?? 0;
      const currentSalary = parseDecimalLoose(clean(r.currentSalary));
      const expectedSalary = parseDecimalLoose(clean(r.expectedSalary));

      // Address JSONs
      const currentAddress = buildAddress(
        clean(r.currentAddressLine1),
        clean(r.currentAddressLine2),
        clean(r.currentCity),
        clean(r.currentState),
        clean(r.currentZip),
        clean(r.currentCountry),
      );
      const permanentAddress = buildAddress(
        clean(r.permanentAddressLine1),
        clean(r.permanentAddressLine2),
        clean(r.permanentCity),
        clean(r.permanentState),
        clean(r.permanentZip),
        clean(r.permanentCountry),
      );

      // Emergency contact + bank as JSON arrays
      const emergencyContacts = buildEmergencyContact(
        clean(r.emergencyContactName),
        clean(r.emergencyContactRelation),
        clean(r.emergencyContactPhone),
        cleanEmail(r.emergencyContactEmail),
      );
      const primaryBank = buildBankAccount(
        clean(r.bankName),
        clean(r.bankAccountNumber),
        clean(r.bankIfsc),
        clean(r.bankAccountHolder),
      );
      const extraBanks = (r.extraBankAccounts ?? [])
        .map((b) => ({
          bankName: clean(b.bankName) ?? "",
          branchName: clean(b.branchName) ?? "",
          accountNumber: clean(b.accountNumber) ?? "",
          accountHolder: clean(b.accountHolder) ?? "",
          ifscCode: clean(b.ifscCode) ?? "",
          accountType: clean(b.accountType) || "Savings",
          isPrimary: false,
        }))
        .filter((b) => b.accountNumber || b.bankName);
      const bankAccounts = [...(primaryBank ?? []), ...extraBanks];

      const extraEmergency = (r.extraEmergencyContacts ?? [])
        .map((c) => ({
          name: clean(c.name) ?? "",
          relationship: clean(c.relationship) ?? "",
          phone: clean(c.phone) ?? "",
          alternatePhone: clean(c.alternatePhone) ?? "",
          email: cleanEmail(c.email) ?? "",
          address: clean(c.address) ?? "",
        }))
        .filter((c) => c.name || c.phone);
      const allEmergencyContacts = [...(emergencyContacts ?? []), ...extraEmergency];

      const educations = (r.educations ?? [])
        .map((e) => ({
          level: clean(e.level) ?? "",
          institution: clean(e.institution) ?? "",
          degree: clean(e.degree) ?? "",
          fieldOfStudy: clean(e.fieldOfStudy) ?? "",
          year: clean(e.year) ?? "",
          grade: clean(e.grade) ?? "",
        }))
        .filter((e) => e.institution || e.degree || e.level);

      const certificationsArr = (r.certifications ?? [])
        .map((c) => ({
          name: clean(c.name) ?? clean(c.courseName) ?? "",
          courseName: clean(c.courseName) ?? "",
          issuingAuthority: clean(c.issuingAuthority) ?? "",
          year: clean(c.year) ?? "",
          expiryDate: clean(c.expiryDate) ?? "",
          credentialUrl: clean(c.credentialUrl) ?? "",
        }))
        .filter((c) => c.name || c.courseName);

      const pastExperiencesArr = (r.pastExperiences ?? [])
        .map((e) => ({
          company: clean(e.company) ?? "",
          jobTitle: clean(e.jobTitle) ?? "",
          totalExperience: clean(e.totalExperience) ?? "",
          lastWorkingDate: clean(e.lastWorkingDate) ?? "",
          skills: clean(e.skills) ?? "",
        }))
        .filter((e) => e.company || e.jobTitle);

      const familyArr = (r.familyMembers ?? [])
        .map((f) => ({
          name: clean(f.name) ?? "",
          relation: clean(f.relation) ?? "",
          dob: clean(f.dob) ?? "",
          occupation: clean(f.occupation) ?? "",
        }))
        .filter((f) => f.name);

      const childrenArr = (r.childrenDetails ?? [])
        .map((c) => ({
          name: clean(c.name) ?? "",
          dob: clean(c.dob) ?? "",
          gender: clean(c.gender) ?? "",
        }))
        .filter((c) => c.name);

      // Manager lookups by employeeCode
      let reportingManagerId: string | null = null;
      const mgrCode = clean(r.reportingManagerCode);
      if (mgrCode) reportingManagerId = managerByCode.get(mgrCode.toLowerCase()) ?? null;
      let dottedLineManagerId: string | null = null;
      const dotMgrCode = clean(r.dottedLineManagerCode);
      if (dotMgrCode) dottedLineManagerId = managerByCode.get(dotMgrCode.toLowerCase()) ?? null;

      if (!dryRun) {
        const code = clean(r.employeeCode) ?? `QK-EMP-${String(Date.now() + i).slice(-8)}`;
        const employeeData = {
          firstName,
          middleName: clean(r.middleName) ?? null,
          lastName,
          personalEmail: personalEmail ?? null,
          workPhone: clean(r.workPhone) ?? null,
          personalPhone: clean(r.personalPhone) ?? null,
          bio: clean(r.bio) ?? null,
          profilePhoto: clean(r.profilePhoto) ?? null,
          linkedinUrl: clean(r.linkedinUrl) ?? null,
          departmentId,
          designationId,
          gradeId,
          officeLocationId,
          reportingManagerId,
          dottedLineManagerId,
          jobTitle: clean(r.jobTitle) ?? clean(r.designation) ?? null,
          dateOfJoining,
          dateOfBirth,
          confirmationDate,
          probationEndDate,
          lastWorkingDate,
          tentativeJoiningDate,
          noticePeriodDays,
          previousExperience,
          employmentType: employmentType as "FullTime",
          workerType: workerType as "Permanent",
          workLocation: workLocation as "Office",
          gender: gender as "Male" | null,
          maritalStatus: maritalStatus as "Single" | null,
          bloodGroup: bloodGroup as "APositive" | null,
          sourceOfHire: sourceOfHire as "Referral" | null,
          nationality: clean(r.nationality) ?? null,
          panNumber: clean(r.panNumber) ?? null,
          aadhaarNumber: clean(r.aadhaarNumber) ?? null,
          uanNumber: clean(r.uanNumber) ?? null,
          pfAccountNumber: clean(r.pfAccountNumber) ?? null,
          esiNumber: clean(r.esiNumber) ?? null,
          taxIdentificationNumber: clean(r.taxIdentificationNumber) ?? null,
          highestQualification: clean(r.highestQualification) ?? null,
          skillSet: clean(r.skillSet) ?? null,
          currentSalary: currentSalary ?? null,
          expectedSalary: expectedSalary ?? null,
          currentAddress: currentAddress ?? undefined,
          permanentAddress: permanentAddress ?? undefined,
          emergencyContacts: allEmergencyContacts.length ? allEmergencyContacts : undefined,
          bankAccounts: bankAccounts.length ? bankAccounts : undefined,
          educations: educations.length ? educations : undefined,
          certifications: certificationsArr.length ? certificationsArr : undefined,
          pastExperiences: pastExperiencesArr.length ? pastExperiencesArr : undefined,
          customFields: (familyArr.length || childrenArr.length)
            ? { family: familyArr, children: childrenArr }
            : undefined,
          status: markActive ? "Active" : "PreBoarding",
          updatedBy: userId,
        };

        let savedId: string;
        if (existing && existing.deletedAt) {
          // Re-hire: restore the soft-deleted employee + overwrite with fresh row data.
          // Cascaded records (salary/leave/etc.) stay deleted — fresh slate from current import row.
          const updated = await prisma.employee.update({
            where: { id: existing.id },
            data: {
              ...(employeeData as object),
              employeeCode: code,
              deletedAt: null,
            } as never,
          });
          savedId = updated.id;
        } else {
          const created = await prisma.employee.create({
            data: {
              orgId,
              employeeCode: code,
              workEmail: effectiveEmail,
              ...(employeeData as object),
              createdBy: userId,
            } as never,
          });
          savedId = created.id;
          // Track freshly onboarded employees so the import can invite them
          // (set-password email + Users & Invitations record). Re-hires excluded.
          createdEmployees.push({
            id: savedId,
            workEmail: effectiveEmail,
            firstName,
            lastName,
            roleId: defaultRoleId,
          });
        }
        // Add to manager lookup so subsequent rows can reference this employee as
        // manager — by code OR either email.
        managerByCode.set(code.toLowerCase(), savedId);
        if (workEmail) managerByCode.set(workEmail.toLowerCase(), savedId);
        if (personalEmail) managerByCode.set(personalEmail.toLowerCase(), savedId);

        // Manager still unknown → it lives in a later row of this same file.
        // Queue the link for the second pass, once every row has been created.
        if ((mgrCode && !reportingManagerId) || (dotMgrCode && !dottedLineManagerId)) {
          pendingManagerLinks.push({
            id: savedId,
            code,
            mgrCode: mgrCode && !reportingManagerId ? mgrCode : null,
            dotCode: dotMgrCode && !dottedLineManagerId ? dotMgrCode : null,
          });
        }

        // Assign the default "employee" role if the employee has none yet.
        // Re-hires may retain a prior role — don't overwrite it.
        if (defaultRoleId) {
          const hasRole = await prisma.hrmsUserAppRole.findFirst({
            where: { orgId: orgId, userId: savedId },
            select: { id: true },
          });
          if (!hasRole) {
            await prisma.hrmsUserAppRole.create({
              data: { orgId: orgId, userId: savedId, roleId: defaultRoleId, assignedBy: userId },
            });
          }
        }
      }
      success += 1;
    } catch (e) {
      // Row numbers alone aren't enough to find the offending row — blank and
      // email-less rows are filtered out upstream before numbering, so "Row 29"
      // here doesn't line up with Excel's row 29. Prefix name/email so the user
      // can just search their file instead of counting rows.
      const who = [clean(r.firstName), clean(r.lastName)].filter(Boolean).join(" ");
      const email = cleanEmail(r.workEmail) ?? cleanEmail(r.personalEmail);
      const identity = [who, email].filter(Boolean).join(" — ");
      const message = e instanceof Error ? e.message : "Unknown error";
      errors.push({ row: i + 1, error: identity ? `${identity}: ${message}` : message });
    }
  }

  // ── Second pass: link managers that were defined further down the same file ──
  // Every row exists in `managerByCode` by now, so file order no longer matters.
  // A code that still doesn't resolve means the manager's OWN row failed — that
  // failure is already reported, so leave this employee's manager blank rather
  // than double-counting one bad row as two errors.
  for (const link of pendingManagerLinks) {
    const mgrId = link.mgrCode ? managerByCode.get(link.mgrCode.toLowerCase()) ?? null : null;
    const dotId = link.dotCode ? managerByCode.get(link.dotCode.toLowerCase()) ?? null : null;
    // Guard against self-links (a code can resolve to the row's own employee).
    const data: { reportingManagerId?: string; dottedLineManagerId?: string } = {};
    if (mgrId && mgrId !== link.id) data.reportingManagerId = mgrId;
    if (dotId && dotId !== link.id) data.dottedLineManagerId = dotId;
    if (Object.keys(data).length === 0) continue;
    await prisma.employee.update({ where: { id: link.id }, data }).catch(() => {});
  }

  return { success, failed: errors.length, errors, warnings, createdEmployees };
}

// ─── Portal token ───────────────────────────────────────

export function generatePortalToken(): string {
  return randomBytes(24).toString("base64url");
}
