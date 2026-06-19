/**
 * Merge HR onboarding CSVs into single structured Excel matching Employee schema.
 * Run: npx tsx scripts/merge-onboarding.ts
 * Output: data/onboarding/merged.xlsx
 */
import * as XLSX from "xlsx";
import path from "path";

const DATA_DIR = path.resolve(__dirname, "../data/onboarding");
const TENANT_DOMAIN = "quikit.local";

type Row = Record<string, any>;

function readCsv(file: string): Row[] {
  const wb = XLSX.readFile(path.join(DATA_DIR, file), { type: "file", raw: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Row>(ws, { defval: "", raw: false });
}

function s(v: any): string {
  if (v === null || v === undefined) return "";
  const t = String(v).trim();
  if (!t || t.toUpperCase() === "NA" || t === "-") return "";
  return t;
}

function parseDDMMYYYY(v: any): string {
  const t = s(v);
  if (!t) return "";
  const m = t.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (!m) return "";
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function parseExpYears(v: any): number {
  const t = s(v).toLowerCase();
  if (!t) return 0;
  const m = t.match(/([\d.]+)/);
  if (!m) return 0;
  return Math.round(parseFloat(m[1]) * 12);
}

function normEnum(v: any, map: Record<string, string>, fallback: string): string {
  const k = s(v).toLowerCase().replace(/[\s\-_]+/g, "");
  return map[k] ?? fallback;
}

const GENDER = { male: "Male", female: "Female", other: "Other" };
const MARITAL = { single: "Single", married: "Married", marrige: "Married", divorced: "Divorced", widowed: "Widowed" };
const BLOOD = {
  "a+": "APositive", "a-": "ANegative",
  "b+": "BPositive", "b-": "BNegative",
  "ab+": "ABPositive", "ab-": "ABNegative", "ab": "ABPositive",
  "o+": "OPositive", "o-": "ONegative",
};
const EMP_TYPE = { fulltime: "FullTime", parttime: "PartTime", contract: "Contract", intern: "Intern" };
const WORKER_TYPE = { permanent: "Permanent", contractor: "Contractor", consultant: "Consultant", trainee: "Trainee" };
const WORK_LOC = { office: "Office", remote: "Remote", hybrid: "Hybrid", onsite: "Onsite" };
const SOURCE = { linkedin: "LinkedIn", referral: "Referral", jobportal: "JobPortal", indeed: "JobPortal", website: "Website", direct: "Direct", agency: "Agency" };

function splitName(full: string): { first: string; middle: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], middle: "", last: "" };
  if (parts.length === 2) return { first: parts[0], middle: "", last: parts[1] };
  return { first: parts[0], middle: parts.slice(1, -1).join(" "), last: parts[parts.length - 1] };
}

function dummyPAN(code: string): string {
  // AAAAA + 4digits + A → 10 chars
  const pad = code.padStart(4, "0").slice(-4);
  return `ABCDE${pad}F`;
}
function dummyAadhaar(code: string): string {
  return `9999${code.padStart(4, "0").slice(-4)}0000`.slice(0, 12);
}
function dummyUAN(code: string): string {
  return `100${code.padStart(9, "0").slice(-9)}`;
}
function dummyPF(code: string): string {
  return `MH/BAN/${code.padStart(7, "0")}/000/${code}`;
}
function dummyESI(code: string): string {
  return `31${code.padStart(4, "0").slice(-4)}0000000`.slice(0, 17).padEnd(17, "0");
}

// ─── Load CSVs ──────────────────────────────────────────
const master = readCsv("HR_Employee_Master.csv");
const banks = readCsv("HR_Employee_bank.csv");
const certs = readCsv("HR_Employee_cert.csv");
const educs = readCsv("HR_Employee_education.csv");
const emrcs = readCsv("HR_Employee_emrc.csv");
const exps = readCsv("HR_Employee_exp.csv");
const sals = readCsv("HR_Employee_salary.csv");

const byCode = <T extends Row>(rows: T[], key = "Emp ID") => {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const code = s(r[key] ?? r["EMP ID"]);
    if (!code) continue;
    if (!m.has(code)) m.set(code, []);
    m.get(code)!.push(r);
  }
  return m;
};

const banksByCode = byCode(banks);
const certsByCode = byCode(certs);
const educsByCode = byCode(educs, "EMP ID");
const emrcsByCode = byCode(emrcs);
const expsByCode = byCode(exps);
const salsByCode = byCode(sals);

// ─── Build sheets ───────────────────────────────────────
const employees: Row[] = [];
const bankRows: Row[] = [];
const eduRows: Row[] = [];
const certRows: Row[] = [];
const emrcRows: Row[] = [];
const pastExpRows: Row[] = [];
const salaryRows: Row[] = [];
const loanRows: Row[] = [];

const seenWorkEmail = new Set<string>();

for (const m of master) {
  const code = s(m["EMP ID"]);
  if (!code) continue;

  const fullName = s(m["Employee Name"]);
  const { first, middle, last } = splitName(fullName);

  // workEmail dedup
  let workEmail = s(m["Work Email"]);
  const personalEmail = s(m["Personal Email"]);
  if (!workEmail) workEmail = personalEmail || `${code}@${TENANT_DOMAIN}`;
  if (seenWorkEmail.has(workEmail.toLowerCase())) {
    workEmail = `${first.toLowerCase()}.${code}@${TENANT_DOMAIN}`;
  }
  seenWorkEmail.add(workEmail.toLowerCase());

  const expRow = expsByCode.get(code)?.[0];
  const emrcRow = emrcsByCode.get(code)?.[0];

  // Employee scalar row
  employees.push({
    employeeCode: code,
    firstName: first,
    middleName: middle,
    lastName: last,
    displayName: fullName,
    gender: normEnum(m["Gender"], GENDER, "Male"),
    dateOfBirth: parseDDMMYYYY(m["Date of Birth"]),
    bloodGroup: normEnum(m["Blood Group"], BLOOD, ""),
    maritalStatus: normEnum(m["Marital Status"], MARITAL, "Single"),
    nationality: s(m["Nationality"]) || "Indian",
    personalEmail,
    workEmail,
    personalPhone: s(m["Personal Phone"]),
    workPhone: s(m["Work Phone"]),
    linkedinUrl: s(expRow?.["LinkedIn URL"]),
    jobTitle: s(m["Designation"]),
    department: s(m["Department"]),
    team: s(m["Team"]),
    designation: s(m["Designation"]),
    grade: s(m["Grade"]),
    employmentType: normEnum(m["Employment Type"], EMP_TYPE, "FullTime"),
    workerType: normEnum(m["Worker Type"], WORKER_TYPE, "Permanent"),
    workLocation: normEnum(m["Work Location"], WORK_LOC, "Office"),
    officeLocation: s(m["Office/Branch"]),
    sourceOfHire: normEnum(m["Source of Hire"], SOURCE, "Direct"),
    noticePeriodDays: parseInt(s(m["Notice Period (Days)"])) || 30,
    dateOfJoining: parseDDMMYYYY(m["Date of Joining"]),
    confirmationDate: parseDDMMYYYY(m["Confirmation Date"]),
    probationEndDate: parseDDMMYYYY(m["Probation End Date"]),
    lastWorkingDate: parseDDMMYYYY(expRow?.["Last Working Date"]),
    previousExperience: parseExpYears(expRow?.["Total Experience"]),
    panNumber: dummyPAN(code),
    aadhaarNumber: dummyAadhaar(code),
    uanNumber: dummyUAN(code),
    pfAccountNumber: dummyPF(code),
    esiNumber: dummyESI(code),
    skills: s(expRow?.["Skills"]),
    status: "Active",
    inviteStatus: "NotInvited",
    taxResidencyStatus: "Resident",
    taxCountry: "IN",
    emergencyContactName: s(emrcRow?.["Contact Person Name"]),
    emergencyContactRelation: s(emrcRow?.["Relationship"]),
    emergencyContactPhone: s(emrcRow?.["Phone Number"]),
    emergencyContactAlternatePhone: s(emrcRow?.["Alternate Number"]),
    emergencyContactAddress: s(emrcRow?.["Address"]),
  });

  // Banks
  for (const b of banksByCode.get(code) ?? []) {
    bankRows.push({
      employeeCode: code,
      bankName: s(b["Bank Name"]),
      branchName: s(b["Branch Name"]),
      accountNumber: s(b["Account Number"]),
      accountHolderName: s(b["Account Holder Name"]),
      ifscCode: s(b["IFSC Code"]),
      accountType: s(b["Account Type"]) || "Savings",
      isPrimary: true,
    });
  }

  // Education
  for (const e of educsByCode.get(code) ?? []) {
    eduRows.push({
      employeeCode: code,
      level: s(e["Level"]),
      institution: s(e["Institution Name"]),
      degree: s(e["Degree"]),
      year: s(e["Year"]),
      grade: s(e["Percentage/CGPA"]),
    });
  }

  // Certifications
  for (const c of certsByCode.get(code) ?? []) {
    certRows.push({
      employeeCode: code,
      courseName: s(c["Course Name"]),
      issuingAuthority: s(c["Issuing Authority"]),
      year: s(c["Year"]),
    });
  }

  // Emergency Contact
  if (emrcRow) {
    emrcRows.push({
      employeeCode: code,
      name: s(emrcRow["Contact Person Name"]),
      relationship: s(emrcRow["Relationship"]),
      phone: s(emrcRow["Phone Number"]),
      alternatePhone: s(emrcRow["Alternate Number"]),
      address: s(emrcRow["Address"]),
    });
  }

  // Past Experience
  if (expRow && s(expRow["Previous Employer"])) {
    pastExpRows.push({
      employeeCode: code,
      company: s(expRow["Previous Employer"]),
      jobTitle: s(expRow["Current Job Title"]),
      totalExperience: s(expRow["Total Experience"]),
      lastWorkingDate: parseDDMMYYYY(expRow["Last Working Date"]),
    });
  }

  // Salary structure (auto-split: Basic 50%, HRA 20%, Special 30%)
  const sal = salsByCode.get(code)?.[0];
  if (sal) {
    const gross = parseFloat(s(sal["Gross Monthly"]).replace(/,/g, "")) || 0;
    const annualCtc = gross * 12;
    const basic = Math.round(gross * 0.5);
    const hra = Math.round(gross * 0.2);
    const special = gross - basic - hra;
    const pt = parseFloat(s(sal["PT Monthly"])) || 0;
    salaryRows.push({
      employeeCode: code,
      effectiveFrom: parseDDMMYYYY(m["Date of Joining"]),
      monthlyGross: gross,
      annualCtc,
      basic,
      hra,
      specialAllowance: special,
      professionalTax: pt,
      currency: "INR",
      remark: s(sal["Remark"]),
    });

    const opening = parseFloat(s(sal["Loan Opening"]).replace(/,/g, "")) || 0;
    const balance = parseFloat(s(sal["Loan Balance"]).replace(/,/g, "")) || 0;
    if (opening > 0 || balance > 0) {
      loanRows.push({
        employeeCode: code,
        principalAmount: opening,
        outstandingBalance: balance,
        monthlyDeduction: parseFloat(s(sal["Loan Deducted"]).replace(/,/g, "")) || 0,
        status: balance > 0 ? "Disbursed" : "Closed",
      });
    }
  }
}

// ─── Build workbook ─────────────────────────────────────
const wb = XLSX.utils.book_new();
const add = (name: string, rows: Row[]) =>
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);

add("Employees", employees);
add("BankAccounts", bankRows);
add("Educations", eduRows);
add("Certifications", certRows);
add("EmergencyContacts", emrcRows);
add("PastExperiences", pastExpRows);
add("SalaryStructure", salaryRows);
add("Loans", loanRows);

const out = path.join(DATA_DIR, "merged.xlsx");
XLSX.writeFile(wb, out);

console.log(`Wrote ${out}`);
console.log(`  Employees: ${employees.length}`);
console.log(`  BankAccounts: ${bankRows.length}`);
console.log(`  Educations: ${eduRows.length}`);
console.log(`  Certifications: ${certRows.length}`);
console.log(`  EmergencyContacts: ${emrcRows.length}`);
console.log(`  PastExperiences: ${pastExpRows.length}`);
console.log(`  SalaryStructure: ${salaryRows.length}`);
console.log(`  Loans: ${loanRows.length}`);
