"use client";

import { useState, useEffect, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { MAX_BULK_UPLOAD_ROWS } from "@/lib/validations/gap-fill";
import { read, utils, SSF, writeFile, type WorkSheet, type CellObject } from "xlsx";
import {
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  ArrowRight,
} from "lucide-react";
import { Select } from "@/components/hrms/select";

interface ImportResult {
  importId: string;
  success: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
}

interface ImportEnqueueResponse {
  importId: string;
  status: "queued";
  totalRows: number;
}

type ImportStatusValue =
  | "ImportPending"
  | "ImportProcessing"
  | "ImportCompleted"
  | "ImportFailed"
  | "ImportPartial";

interface ImportStatus {
  id: string;
  status: ImportStatusValue;
  totalRows: number;
  processedRows: number;
  successRows: number;
  failedRows: number;
  errors: Array<{ row: number; error: string }> | null;
  fileName: string;
}

// Canonical fields the API understands. `combined` = parse from a single column.
type CanonicalKey =
  | "skip"
  | "employeeCode"
  | "firstName"
  | "middleName"
  | "lastName"
  | "fullName"
  | "workEmail"
  | "personalEmail"
  | "workPhone"
  | "personalPhone"
  | "departmentCode"
  | "departmentName"
  | "designation"
  | "team"
  | "grade"
  | "dateOfJoining"
  | "dateOfBirth"
  | "confirmationDate"
  | "probationEndDate"
  | "employmentType"
  | "workerType"
  | "workLocation"
  | "officeLocation"
  | "jobTitle"
  | "panNumber"
  | "aadhaarNumber"
  | "gender"
  | "maritalStatus"
  | "bloodGroup"
  | "nationality"
  | "sourceOfHire"
  | "noticePeriodDays"
  | "previousExperience"
  | "lastWorkingDate"
  | "tentativeJoiningDate"
  // Address - current
  | "currentAddressLine1"
  | "currentAddressLine2"
  | "currentCity"
  | "currentState"
  | "currentZip"
  | "currentCountry"
  // Address - permanent
  | "permanentAddressLine1"
  | "permanentAddressLine2"
  | "permanentCity"
  | "permanentState"
  | "permanentZip"
  | "permanentCountry"
  // Emergency contact
  | "emergencyContactName"
  | "emergencyContactRelation"
  | "emergencyContactPhone"
  | "emergencyContactEmail"
  // Bank
  | "bankName"
  | "bankAccountNumber"
  | "bankIfsc"
  | "bankAccountHolder"
  // Manager
  | "reportingManagerCode"
  | "dottedLineManagerCode"
  // Statutory
  | "uanNumber"
  | "pfAccountNumber"
  | "esiNumber"
  | "taxIdentificationNumber"
  // Education / Skills
  | "highestQualification"
  | "skillSet"
  // Salary
  | "currentSalary"
  | "expectedSalary"
  // Profile
  | "profilePhoto"
  | "bio"
  | "linkedinUrl";

const CANONICAL_FIELDS: { key: CanonicalKey; label: string; required?: boolean }[] = [
  { key: "skip", label: "— Skip column —" },
  { key: "fullName", label: "Full Name (auto-split)" },
  { key: "firstName", label: "First Name", required: true },
  { key: "middleName", label: "Middle Name" },
  { key: "lastName", label: "Last Name", required: true },
  { key: "employeeCode", label: "Employee Code / EMP ID" },
  { key: "workEmail", label: "Work Email" },
  { key: "personalEmail", label: "Personal Email" },
  { key: "workPhone", label: "Work Phone" },
  { key: "personalPhone", label: "Personal Phone" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "gender", label: "Gender" },
  { key: "maritalStatus", label: "Marital Status" },
  { key: "bloodGroup", label: "Blood Group" },
  { key: "nationality", label: "Nationality" },
  { key: "departmentName", label: "Department (by name)" },
  { key: "departmentCode", label: "Department Code" },
  { key: "designation", label: "Designation" },
  { key: "team", label: "Team" },
  { key: "grade", label: "Grade" },
  { key: "dateOfJoining", label: "Date of Joining" },
  { key: "confirmationDate", label: "Confirmation Date" },
  { key: "probationEndDate", label: "Probation End Date" },
  { key: "employmentType", label: "Employment Type" },
  { key: "workerType", label: "Worker Type" },
  { key: "workLocation", label: "Work Location (Office/Remote/Hybrid)" },
  { key: "officeLocation", label: "Office Location / Branch" },
  { key: "jobTitle", label: "Job Title" },
  { key: "sourceOfHire", label: "Source of Hire" },
  { key: "noticePeriodDays", label: "Notice Period (Days)" },
  { key: "previousExperience", label: "Previous Experience (Months)" },
  { key: "lastWorkingDate", label: "Last Working Date" },
  { key: "tentativeJoiningDate", label: "Tentative Joining Date" },
  { key: "panNumber", label: "PAN Number" },
  { key: "aadhaarNumber", label: "Aadhaar Number" },
  { key: "uanNumber", label: "UAN Number" },
  { key: "pfAccountNumber", label: "PF Account" },
  { key: "esiNumber", label: "ESI Number" },
  { key: "taxIdentificationNumber", label: "Tax ID (TIN)" },
  // Address (current)
  { key: "currentAddressLine1", label: "Current Address Line 1" },
  { key: "currentAddressLine2", label: "Current Address Line 2" },
  { key: "currentCity", label: "Current City" },
  { key: "currentState", label: "Current State" },
  { key: "currentZip", label: "Current ZIP / PIN" },
  { key: "currentCountry", label: "Current Country" },
  // Address (permanent)
  { key: "permanentAddressLine1", label: "Permanent Address Line 1" },
  { key: "permanentAddressLine2", label: "Permanent Address Line 2" },
  { key: "permanentCity", label: "Permanent City" },
  { key: "permanentState", label: "Permanent State" },
  { key: "permanentZip", label: "Permanent ZIP / PIN" },
  { key: "permanentCountry", label: "Permanent Country" },
  // Emergency Contact
  { key: "emergencyContactName", label: "Emergency Contact Name" },
  { key: "emergencyContactRelation", label: "Emergency Contact Relation" },
  { key: "emergencyContactPhone", label: "Emergency Contact Phone" },
  { key: "emergencyContactEmail", label: "Emergency Contact Email" },
  // Bank
  { key: "bankName", label: "Bank Name" },
  { key: "bankAccountNumber", label: "Bank Account Number" },
  { key: "bankIfsc", label: "Bank IFSC" },
  { key: "bankAccountHolder", label: "Bank Account Holder Name" },
  // Manager
  { key: "reportingManagerCode", label: "Reporting Manager (EMP ID)" },
  { key: "dottedLineManagerCode", label: "Dotted-line Manager (EMP ID)" },
  // Education / Skills
  { key: "highestQualification", label: "Highest Qualification" },
  { key: "skillSet", label: "Skills (comma-separated)" },
  // Salary
  { key: "currentSalary", label: "Current Salary" },
  { key: "expectedSalary", label: "Expected Salary" },
  // Profile
  { key: "profilePhoto", label: "Profile Photo URL" },
  { key: "bio", label: "Bio / About" },
  { key: "linkedinUrl", label: "LinkedIn URL" },
];

// Header → canonical guess. Lowercase on both sides, stripped of punctuation.
const AUTO_MAP_HINTS: Array<{ patterns: string[]; key: CanonicalKey }> = [
  { patterns: ["empid", "empcode", "employeecode", "employeeid", "code"], key: "employeeCode" },
  { patterns: ["employeename", "fullname", "name"], key: "fullName" },
  { patterns: ["firstname", "fname", "givenname"], key: "firstName" },
  { patterns: ["lastname", "lname", "surname", "familyname"], key: "lastName" },
  { patterns: ["workemail", "officeemail", "companyemail", "email"], key: "workEmail" },
  { patterns: ["personalemail", "privateemail"], key: "personalEmail" },
  { patterns: ["workphone", "officephone", "companyphone"], key: "workPhone" },
  { patterns: ["personalphone", "mobile", "phone", "contact"], key: "personalPhone" },
  { patterns: ["department", "deptname", "deptt"], key: "departmentName" },
  { patterns: ["departmentcode", "deptcode"], key: "departmentCode" },
  { patterns: ["designation", "role", "position"], key: "designation" },
  { patterns: ["team"], key: "team" },
  { patterns: ["grade", "band"], key: "grade" },
  { patterns: ["dateofjoining", "doj", "joiningdate", "joindate"], key: "dateOfJoining" },
  { patterns: ["employmenttype", "emptype", "type"], key: "employmentType" },
  { patterns: ["workertype", "workertypes"], key: "workerType" },
  { patterns: ["worklocation", "workmode", "locationtype"], key: "workLocation" },
  { patterns: ["officelocation", "office", "branch", "officebranch", "site", "location"], key: "officeLocation" },
  { patterns: ["jobtitle", "title"], key: "jobTitle" },
  { patterns: ["panno", "pannumber", "pan"], key: "panNumber" },
  { patterns: ["aadhaar", "aadhar", "aadhaarno", "aadhaarnumber", "uid"], key: "aadhaarNumber" },
  { patterns: ["dateofbirth", "dob", "birthdate", "birthday"], key: "dateOfBirth" },
  { patterns: ["gender", "sex"], key: "gender" },
  { patterns: ["maritalstatus", "marital"], key: "maritalStatus" },
  { patterns: ["bloodgroup", "blood"], key: "bloodGroup" },
  { patterns: ["nationality", "country"], key: "nationality" },
  { patterns: ["sourceofhire", "source", "hiredfrom", "channel"], key: "sourceOfHire" },
  { patterns: ["noticeperiod", "noticeperioddays", "noticedays"], key: "noticePeriodDays" },
  { patterns: ["confirmationdate", "confirmdate"], key: "confirmationDate" },
  { patterns: ["probationenddate", "probationend"], key: "probationEndDate" },
  { patterns: ["lastworkingdate", "lwd"], key: "lastWorkingDate" },
  { patterns: ["tentativejoiningdate", "tentativejoin"], key: "tentativeJoiningDate" },
  { patterns: ["middlename", "mname"], key: "middleName" },
  { patterns: ["previousexperience", "prevexp", "experience", "totalexperience"], key: "previousExperience" },
  // Address current
  { patterns: ["currentaddressline1", "currentaddress1", "currentaddress", "addressline1", "address1", "presentaddress"], key: "currentAddressLine1" },
  { patterns: ["currentaddressline2", "currentaddress2", "addressline2", "address2"], key: "currentAddressLine2" },
  { patterns: ["currentcity", "city", "presentcity"], key: "currentCity" },
  { patterns: ["currentstate", "state", "presentstate"], key: "currentState" },
  { patterns: ["currentzip", "currentpin", "zip", "pincode", "postalcode"], key: "currentZip" },
  { patterns: ["currentcountry"], key: "currentCountry" },
  // Address permanent
  { patterns: ["permanentaddressline1", "permanentaddress1", "permanentaddress", "homeaddress"], key: "permanentAddressLine1" },
  { patterns: ["permanentaddressline2", "permanentaddress2"], key: "permanentAddressLine2" },
  { patterns: ["permanentcity", "homecity"], key: "permanentCity" },
  { patterns: ["permanentstate", "homestate"], key: "permanentState" },
  { patterns: ["permanentzip", "permanentpin"], key: "permanentZip" },
  { patterns: ["permanentcountry"], key: "permanentCountry" },
  // Emergency contact
  { patterns: ["emergencycontactname", "emergencyname", "ecname"], key: "emergencyContactName" },
  { patterns: ["emergencycontactrelation", "emergencyrelation", "relation"], key: "emergencyContactRelation" },
  { patterns: ["emergencycontactphone", "emergencyphone", "ecphone"], key: "emergencyContactPhone" },
  { patterns: ["emergencycontactemail", "emergencyemail"], key: "emergencyContactEmail" },
  // Bank
  { patterns: ["bankname"], key: "bankName" },
  { patterns: ["bankaccountnumber", "accountnumber", "accountno", "accno"], key: "bankAccountNumber" },
  { patterns: ["bankifsc", "ifsc", "ifsccode"], key: "bankIfsc" },
  { patterns: ["bankaccountholder", "accountholder", "accountholdername"], key: "bankAccountHolder" },
  // Manager
  { patterns: ["reportingmanager", "manager", "reportingmanagercode", "managercode", "managerempid"], key: "reportingManagerCode" },
  { patterns: ["dottedlinemanager", "dottedmanager", "dottedlinemanagercode"], key: "dottedLineManagerCode" },
  // Statutory
  { patterns: ["uan", "uannumber"], key: "uanNumber" },
  { patterns: ["pfaccount", "pfaccountnumber", "pfno"], key: "pfAccountNumber" },
  { patterns: ["esi", "esinumber", "esino"], key: "esiNumber" },
  { patterns: ["tin", "taxid", "taxidentificationnumber"], key: "taxIdentificationNumber" },
  // Education
  { patterns: ["highestqualification", "qualification", "education", "degree"], key: "highestQualification" },
  { patterns: ["skillset", "skills", "skill"], key: "skillSet" },
  // Salary
  { patterns: ["currentsalary", "ctc", "salary"], key: "currentSalary" },
  { patterns: ["expectedsalary", "expectedctc"], key: "expectedSalary" },
  // Profile
  { patterns: ["profilephoto", "photo", "photourl", "avatar"], key: "profilePhoto" },
  { patterns: ["bio", "about", "summary"], key: "bio" },
  { patterns: ["linkedinurl", "linkedin"], key: "linkedinUrl" },
];

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function autoMap(headers: string[]): Record<string, CanonicalKey> {
  const result: Record<string, CanonicalKey> = {};
  for (const h of headers) {
    const norm = normalizeHeader(h);
    let mapped: CanonicalKey = "skip";
    // Pass 1: exact match. Prevents a loose substring alias (e.g. "country" on
    // Nationality) from hijacking a more specific header ("currentcountry").
    for (const hint of AUTO_MAP_HINTS) {
      if (hint.patterns.some((p) => norm === p)) {
        mapped = hint.key;
        break;
      }
    }
    // Pass 2: substring match, only if no exact match was found.
    if (mapped === "skip") {
      for (const hint of AUTO_MAP_HINTS) {
        if (hint.patterns.some((p) => norm.includes(p))) {
          mapped = hint.key;
          break;
        }
      }
    }
    result[h] = mapped;
  }
  return result;
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// Mirrors the Add Employee form (apps/quikhrms/app/(dashboard)/employees/new),
// ordered by its wizard steps. Every column auto-maps to a CANONICAL_FIELD and is
// accepted by bulkEmployeeRowSchema, so a downloaded template covers the same
// fields a manually-added employee would.
// Downloaded import template exposes only the MANDATORY columns — the practical
// minimum to create a usable employee. Any other field (address, KYC, bank,
// etc.) can still be added as an extra column in the uploaded file; the column
// mapper recognises them via autoMap. Keeping the template lean stops users from
// feeling they must fill 50+ columns.
const TEMPLATE_HEADERS = [
  "First Name",
  "Last Name",
  "Work Email",
  "Date of Joining",
  "Department",
  "Designation",
  "Reporting Manager (EMP ID)",
];

export default function BulkImportEmployeesPage() {
  const api = useApiClient();
  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [markActive, setMarkActive] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [subSheets, setSubSheets] = useState<Record<string, Map<string, Record<string, string>[]>>>({});
  const [mapping, setMapping] = useState<Record<string, CanonicalKey>>({});
  const [parseError, setParseError] = useState<string | null>(null);

  // Auto-suggest mapping when headers change
  useEffect(() => {
    if (headers.length > 0) {
      setMapping(autoMap(headers));
    }
  }, [headers]);

  const [pendingImportId, setPendingImportId] = useState<string | null>(null);
  const [pollProgress, setPollProgress] = useState<ImportStatus | null>(null);

  const importMut = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<ImportEnqueueResponse>("/api/v1/hrms/employees/bulk-import", body),
    onSuccess: (res) => {
      setPendingImportId(res.data.importId);
      setPollProgress({
        id: res.data.importId,
        status: "ImportPending",
        totalRows: res.data.totalRows,
        processedRows: 0,
        successRows: 0,
        failedRows: 0,
        errors: null,
        fileName: fileName || "bulk.csv",
      });
    },
  });

  // Poll status of pending import every 2s until terminal state
  useEffect(() => {
    if (!pendingImportId) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await api.get<ImportStatus>(`/api/v1/hrms/employees/bulk-import/${pendingImportId}`);
        if (cancelled) return;
        setPollProgress(res.data);
        const terminal =
          res.data.status === "ImportCompleted" ||
          res.data.status === "ImportFailed" ||
          res.data.status === "ImportPartial";
        if (terminal) {
          setResult({
            importId: res.data.id,
            success: res.data.successRows,
            failed: res.data.failedRows,
            errors: Array.isArray(res.data.errors) ? res.data.errors : [],
          });
          setPendingImportId(null);
        }
      } catch (err) {
        console.error("[poll] error:", err);
      }
    };

    tick();
    const handle = setInterval(tick, 2000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [pendingImportId, api]);

  const parseCSV = (text: string): { headers: string[]; rows: Record<string, string>[] } => {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows = lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] ?? "";
      });
      return obj;
    });
    return { headers, rows };
  };

  const normalizeCell = (v: unknown): string => {
    if (v == null) return "";
    if (v instanceof Date) {
      // XLSX with cellDates:true returns UTC-midnight Date for date cells.
      // Use UTC getters to avoid local-TZ shifting day backward.
      const y = v.getUTCFullYear();
      const m = String(v.getUTCMonth() + 1).padStart(2, "0");
      const d = String(v.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const s = String(v).trim();
    // Convert DD-MM-YYYY or DD/MM/YYYY string dates → YYYY-MM-DD
    const m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      const day = parseInt(dd, 10);
      const mon = parseInt(mm, 10);
      if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
        return `${yyyy}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
    return s;
  };

  // Column-fingerprint based detection. Each row = score header tokens against type signatures.
  // Highest-scoring type wins (min score 2). Sheet name is irrelevant.
  type SubSheetType = "education" | "certification" | "experience" | "family" | "children" | "bank" | "emergency";

  const TYPE_SIGNATURES: Record<SubSheetType, RegExp[]> = {
    education:     [/institution/i, /\bschool\b/i, /university/i, /college/i, /\bboard\b/i, /degree/i, /qualification/i, /percentage|cgpa|gpa/i, /\bclass\b|standard/i],
    certification: [/certificat/i, /course\s*name/i, /issuing/i, /credential/i, /\bauthority\b/i, /issued\s*by/i, /license/i],
    experience:    [/previous\s*employer/i, /prior\s*employer/i, /past\s*company/i, /total\s*experience/i, /\bemployer\b/i, /job\s*title/i, /last\s*working|end\s*date/i, /\bskills\b/i],
    family:        [/family/i, /spouse|husband|wife/i, /\bfather\b/i, /\bmother\b/i, /occupation/i, /dependent/i, /\brelative\b/i, /\brelation(ship)?\b/i],
    children:      [/\bchild(ren)?\b/i, /\bson\b|\bdaughter\b/i, /\bkid\b/i],
    bank:          [/account\s*(number|no\.?)/i, /\bifsc\b/i, /bank\s*name/i, /branch/i, /account\s*holder/i, /account\s*type/i],
    emergency:     [/emergency/i, /contact\s*person/i, /alternate\s*(number|phone)/i, /\bsos\b/i, /next\s*of\s*kin/i],
  };

  const classifySheet = (headers: string[]): SubSheetType | null => {
    const headerStr = headers.join(" | ").toLowerCase();
    let best: { type: SubSheetType; score: number } | null = null;
    for (const [type, sigs] of Object.entries(TYPE_SIGNATURES) as Array<[SubSheetType, RegExp[]]>) {
      const score = sigs.reduce((n, re) => (re.test(headerStr) ? n + 1 : n), 0);
      if (score > 0 && (!best || score > best.score)) best = { type, score };
    }
    if (!best || best.score < 2) return null;
    // Children disambiguation: if headers contain 'child' explicitly, force children even if family scored higher
    if (TYPE_SIGNATURES.children.some((re) => re.test(headerStr))) return "children";
    return best.type;
  };

  // Walk cells directly. For numeric date-formatted cells use SSF.parse_date_code (TZ-agnostic).
  const parseSheet = (ws: WorkSheet): { headers: string[]; rows: Record<string, string>[] } => {
    const ref = ws["!ref"];
    if (!ref) return { headers: [], rows: [] };
    const range = utils.decode_range(ref);

    const isDateFormat = (z: string | undefined): boolean => {
      if (!z) return false;
      // Excel date format codes contain y/m/d/h. Strip quoted literals first.
      const stripped = z.replace(/"[^"]*"/g, "");
      return /[ymdhs]/i.test(stripped);
    };

    const cellToString = (cell: CellObject | undefined): string => {
      if (!cell || cell.v == null || cell.v === "") return "";
      // Numeric cell with date format → format via SSF as ISO date
      if (cell.t === "n" && isDateFormat(typeof cell.z === "string" ? cell.z : undefined) && typeof cell.v === "number") {
        const parsed = SSF.parse_date_code(cell.v);
        if (parsed) {
          return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
        }
      }
      // String dates DD-MM-YYYY / DD/MM/YYYY → ISO
      if (cell.t === "s" && typeof cell.v === "string") {
        const m = cell.v.trim().match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
        if (m) {
          const [, dd, mm, yyyy] = m;
          const day = parseInt(dd, 10);
          const mon = parseInt(mm, 10);
          if (day >= 1 && day <= 31 && mon >= 1 && mon <= 12) {
            return `${yyyy}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          }
        }
      }
      // Fallback: stringify
      return String(cell.v).trim();
    };

    // Headers from row 1
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = utils.encode_cell({ r: range.s.r, c });
      const h = cellToString(ws[addr]);
      if (h) headers.push(h);
      else headers.push("");
    }
    const headerNames = headers.filter(Boolean);
    if (headerNames.length === 0) return { headers: [], rows: [] };

    const rows: Record<string, string>[] = [];
    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const obj: Record<string, string> = {};
      let hasValue = false;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const h = headers[c - range.s.c];
        if (!h) continue;
        const addr = utils.encode_cell({ r, c });
        const val = cellToString(ws[addr]);
        if (val) hasValue = true;
        obj[h] = val;
      }
      if (hasValue) rows.push(obj);
    }
    return { headers: headerNames, rows };
  };

  // Find employee-code-like column. Matches any header containing "emp" + "id"/"code".
  const findEmpIdKey = (headers: string[]): string | null => {
    return headers.find((h) => {
      const n = h.toLowerCase().replace(/[\s_\-.]+/g, "");
      return /^(emp(loyee)?(id|code|no\.?|number))$/i.test(n) || (n.includes("emp") && (n.includes("id") || n.includes("code")));
    }) ?? null;
  };

  const groupByEmpId = (
    headers: string[],
    rows: Record<string, string>[],
    mapper: (r: Record<string, string>) => Record<string, string>,
  ): Map<string, Record<string, string>[]> => {
    const empKey = findEmpIdKey(headers);
    const out = new Map<string, Record<string, string>[]>();
    if (!empKey) return out;
    for (const r of rows) {
      const code = (r[empKey] ?? "").trim();
      if (!code) continue;
      const arr = out.get(code) ?? [];
      arr.push(mapper(r));
      out.set(code, arr);
    }
    return out;
  };

  // Header picker: case-insensitive, ignores spaces/punctuation. Tries exact match first, then "contains".
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-./]+/g, "");
  const pickHeader = (row: Record<string, string>, ...candidates: string[]): string => {
    const keys = Object.keys(row);
    const normed = keys.map((k) => ({ k, n: norm(k) }));
    for (const cand of candidates) {
      const c = norm(cand);
      const exact = normed.find((p) => p.n === c);
      if (exact && row[exact.k]) return row[exact.k];
    }
    for (const cand of candidates) {
      const c = norm(cand);
      const part = normed.find((p) => p.n.includes(c) || c.includes(p.n));
      if (part && row[part.k]) return row[part.k];
    }
    return "";
  };

  const parseExcel = (
    buffer: ArrayBuffer
  ): { headers: string[]; rows: Record<string, string>[]; subSheets: Record<string, Map<string, Record<string, string>[]>> } => {
    const wb = read(buffer, { type: "array", cellDates: false, cellNF: true });
    if (wb.SheetNames.length === 0) return { headers: [], rows: [], subSheets: {} };

    // Master = first sheet
    const masterParsed = parseSheet(wb.Sheets[wb.SheetNames[0]]);

    // Sub-sheets = remaining sheets, classified dynamically by column headers (sheet name ignored).
    // Multiple sheets of same type get merged. Sheets with no recognizable columns are skipped.
    const subSheets: Record<string, Map<string, Record<string, string>[]>> = {};
    for (const name of wb.SheetNames.slice(1)) {
      const { headers, rows } = parseSheet(wb.Sheets[name]);
      if (!headers.length || !rows.length) continue;
      const type = classifySheet(headers);
      if (!type) continue;
      let mapper: (r: Record<string, string>) => Record<string, string>;
      switch (type) {
        case "education":
          mapper = (r) => ({
            level:        pickHeader(r, "Level"),
            institution:  pickHeader(r, "Institution Name", "Institution", "School"),
            degree:       pickHeader(r, "Degree"),
            fieldOfStudy: pickHeader(r, "Field of Study", "Specialization"),
            year:         pickHeader(r, "Year", "Completion Year"),
            grade:        pickHeader(r, "Percentage/CGPA", "Grade", "Marks"),
          });
          break;
        case "certification":
          mapper = (r) => ({
            name:             pickHeader(r, "Name", "Course Name", "Certification"),
            courseName:       pickHeader(r, "Course Name", "Course"),
            issuingAuthority: pickHeader(r, "Issuing Authority", "Authority", "Issued By"),
            year:             pickHeader(r, "Year"),
            expiryDate:       pickHeader(r, "Expiry Date", "Expiry"),
            credentialUrl:    pickHeader(r, "Credential URL", "URL"),
          });
          break;
        case "experience":
          mapper = (r) => ({
            company:         pickHeader(r, "Previous Employer", "Company", "Employer"),
            jobTitle:        pickHeader(r, "Current Job Title", "Job Title", "Designation"),
            totalExperience: pickHeader(r, "Total Experience", "Experience"),
            lastWorkingDate: pickHeader(r, "Last Working Date", "End Date"),
            skills:          pickHeader(r, "Skills"),
          });
          break;
        case "family":
          mapper = (r) => ({
            name:       pickHeader(r, "Name", "Member Name"),
            relation:   pickHeader(r, "Relation", "Relationship"),
            dob:        pickHeader(r, "DOB", "Date of Birth"),
            occupation: pickHeader(r, "Occupation"),
          });
          break;
        case "children":
          mapper = (r) => ({
            name:   pickHeader(r, "Name", "Child Name"),
            dob:    pickHeader(r, "DOB", "Date of Birth"),
            gender: pickHeader(r, "Gender"),
          });
          break;
        case "bank":
          mapper = (r) => ({
            bankName:       pickHeader(r, "Bank Name"),
            branchName:     pickHeader(r, "Branch Name", "Branch"),
            accountNumber:  pickHeader(r, "Account Number"),
            accountHolder:  pickHeader(r, "Account Holder Name", "Account Holder"),
            ifscCode:       pickHeader(r, "IFSC Code", "IFSC"),
            accountType:    pickHeader(r, "Account Type"),
          });
          break;
        case "emergency":
          mapper = (r) => ({
            name:           pickHeader(r, "Contact Person Name", "Name"),
            relationship:   pickHeader(r, "Relationship", "Relation"),
            phone:          pickHeader(r, "Phone Number", "Phone"),
            alternatePhone: pickHeader(r, "Alternate Number", "Alternate Phone"),
            email:          pickHeader(r, "Email"),
            address:        pickHeader(r, "Address"),
          });
          break;
        default: mapper = (r) => r;
      }
      const grouped = groupByEmpId(headers, rows, mapper);
      const existing = subSheets[type];
      if (existing) {
        for (const [code, arr] of grouped) {
          existing.set(code, [...(existing.get(code) ?? []), ...arr]);
        }
      } else {
        subSheets[type] = grouped;
      }
    }

    return { headers: masterParsed.headers, rows: masterParsed.rows, subSheets };
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParseError(null);
    setResult(null);

    const ext = file.name.toLowerCase().split(".").pop();
    const isExcel = ext === "xlsx" || ext === "xls";

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = isExcel
          ? parseExcel(ev.target?.result as ArrayBuffer)
          : { ...parseCSV(ev.target?.result as string), subSheets: {} as Record<string, Map<string, Record<string, string>[]>> };
        setHeaders(parsed.headers);
        setRawRows(parsed.rows);
        setSubSheets(parsed.subSheets);
        const subSummary = Object.entries(parsed.subSheets)
          .map(([k, m]) => `${k}:${Array.from(m.values()).reduce((n, a) => n + a.length, 0)}`)
          .join(", ");
        setRawText(isExcel
          ? `[${file.name}] — ${parsed.rows.length} master rows${subSummary ? ` · sub-sheets: ${subSummary}` : ""}`
          : (ev.target?.result as string));
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Failed to parse file");
        setHeaders([]);
        setRawRows([]);
        setSubSheets({});
      }
    };
    reader.onerror = () => setParseError("Failed to read file");
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  // Transform raw rows to canonical rows using current mapping.
  // Strip placeholder/blank values ("NA", "N/A", "-", "—", empty) so backend Zod sees clean data.
  const NA_VALUES = new Set(["", "na", "n/a", "none", "null", "-", "—"]);
  const isPlaceholder = (v: string): boolean =>
    NA_VALUES.has(v.trim().toLowerCase());

  const canonicalRows = useMemo(() => {
    if (rawRows.length === 0) return [];
    return rawRows.map((row) => {
      const out: Record<string, string> = {};
      for (const [header, canon] of Object.entries(mapping)) {
        if (canon === "skip") continue;
        const v = row[header];
        if (!v || isPlaceholder(v)) continue;
        if (canon === "fullName") {
          const { firstName, lastName } = splitName(v);
          if (firstName && !out.firstName) out.firstName = firstName;
          if (lastName && !out.lastName) out.lastName = lastName;
        } else {
          // Don't overwrite if already set (e.g. fullName already filled firstName)
          if (!out[canon]) out[canon] = v;
        }
      }
      return out;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, mapping]);

  // Merge sub-sheet arrays into canonical rows by employeeCode
  const enrichedRows = useMemo(() => {
    if (canonicalRows.length === 0 || Object.keys(subSheets).length === 0) return canonicalRows;
    return canonicalRows.map((r) => {
      const code = (r.employeeCode ?? "").trim();
      if (!code) return r;
      const get = (t: string) => subSheets[t]?.get(code);
      const enriched: Record<string, unknown> = { ...r };
      const edu = get("education"); if (edu?.length) enriched.educations = edu;
      const cer = get("certification"); if (cer?.length) enriched.certifications = cer;
      const exp = get("experience"); if (exp?.length) enriched.pastExperiences = exp;
      const fam = get("family"); if (fam?.length) enriched.familyMembers = fam;
      const chi = get("children"); if (chi?.length) enriched.childrenDetails = chi;
      const bnk = get("bank"); if (bnk?.length) enriched.extraBankAccounts = bnk;
      const emr = get("emergency"); if (emr?.length) enriched.extraEmergencyContacts = emr;
      return enriched as Record<string, string>;
    });
  }, [canonicalRows, subSheets]);

  // Identify rows missing both work + personal email — these will fail import
  const rowsMissingEmail = useMemo(() => {
    const issues: { row: number; name: string }[] = [];
    canonicalRows.forEach((r, i) => {
      const hasWork = r.workEmail && r.workEmail.trim();
      const hasPersonal = r.personalEmail && r.personalEmail.trim();
      if (!hasWork && !hasPersonal) {
        issues.push({
          row: i + 1,
          name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || "(no name)",
        });
      }
    });
    return issues;
  }, [canonicalRows]);

  // Validate that required canonical fields are mapped
  const mappingValid = useMemo(() => {
    const mapped = new Set(Object.values(mapping));
    const hasFullName = mapped.has("fullName");
    const hasFirst = mapped.has("firstName");
    const hasLast = mapped.has("lastName");
    return hasFullName || (hasFirst && hasLast);
  }, [mapping]);

  const downloadTemplate = (format: "csv" | "xlsx") => {
    const sampleValues: Record<string, string> = {
      // Personal
      "EMP ID": "1001",
      "First Name": "Rahul",
      "Middle Name": "Kumar",
      "Last Name": "Verma",
      "Gender": "Male",
      "Date of Birth": "1995-08-12",
      "Marital Status": "Single",
      "Blood Group": "O+",
      "Nationality": "Indian",
      // Contact
      "Work Email": "rahul@quikit.ai",
      "Personal Email": "rahul.v@gmail.com",
      "Work Phone": "9876543210",
      "Personal Phone": "9988776655",
      // Emergency contact
      "Emergency Contact Name": "Suresh Verma",
      "Emergency Contact Relation": "Father",
      "Emergency Contact Phone": "9811122233",
      "Emergency Contact Email": "suresh.verma@gmail.com",
      // Current address
      "Current Address Line 1": "12 MG Road",
      "Current Address Line 2": "Near City Park",
      "Current City": "Mumbai",
      "Current State": "Maharashtra",
      "Current ZIP": "400001",
      "Current Country": "India",
      // Permanent address
      "Permanent Address Line 1": "45 Civil Lines",
      "Permanent Address Line 2": "",
      "Permanent City": "Jaipur",
      "Permanent State": "Rajasthan",
      "Permanent ZIP": "302006",
      "Permanent Country": "India",
      // Employment
      "Designation": "Software Engineer",
      "Department": "Engineering",
      "Team": "Backend",
      "Grade": "L3",
      "Job Title": "Software Engineer",
      "Reporting Manager (EMP ID)": "1000",
      "Employment Type": "Full Time",
      "Worker Type": "Permanent",
      "Work Location": "Office",
      "Office/Branch": "Mumbai",
      "Source of Hire": "Referral",
      "Notice Period (Days)": "30",
      "Previous Experience (Months)": "24",
      "Date of Joining": "2026-04-15",
      "Confirmation Date": "2026-10-15",
      "Probation End Date": "2026-10-15",
      // Education & skills
      "Highest Qualification": "B.Tech Computer Science",
      "Skills": "Node.js, React, PostgreSQL",
      // Identity (KYC)
      "PAN Number": "ABCDE1234F",
      "Aadhaar Number": "123456789012",
      "UAN Number": "100200300400",
      "PF Account": "MH/BAN/0012345/000/0000456",
      "ESI Number": "3100123456",
      "Tax ID (TIN)": "",
      // Bank
      "Bank Name": "HDFC Bank",
      "Bank Account Number": "50100123456789",
      "Bank IFSC": "HDFC0001234",
      "Bank Account Holder Name": "Rahul Kumar Verma",
    };
    if (format === "csv") {
      const csv = [
        TEMPLATE_HEADERS.join(","),
        TEMPLATE_HEADERS.map((h) => sampleValues[h] ?? "").join(","),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "employee-import-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const ws = utils.json_to_sheet([sampleValues], { header: TEMPLATE_HEADERS });
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "Employees");
      writeFile(wb, "employee-import-template.xlsx");
    }
  };

  const runImport = () => {
    if (enrichedRows.length === 0) return;
    setResult(null);
    // Skip rows without any email — surfaced to user via warning banner
    const importable = enrichedRows.filter((r) => {
      const w = (r.workEmail as string | undefined)?.trim();
      const p = (r.personalEmail as string | undefined)?.trim();
      return !!(w || p);
    });
    if (importable.length === 0) {
      setResult({
        importId: "",
        success: 0,
        failed: 0,
        errors: [{ row: 0, error: "All rows missing email — nothing to import" }],
      });
      return;
    }
    // Match the server cap (bulkImportEmployeesSchema) — fail early with a clear
    // message instead of POSTing a too-large batch only to be rejected.
    if (importable.length > MAX_BULK_UPLOAD_ROWS) {
      setResult({
        importId: "",
        success: 0,
        failed: 0,
        errors: [{
          row: 0,
          error: `You can upload at most ${MAX_BULK_UPLOAD_ROWS} employees at a time — this file has ${importable.length}. Split it into smaller batches.`,
        }],
      });
      return;
    }
    importMut.mutate({ fileName: fileName || "bulk.csv", rows: importable, dryRun, markActive });
  };

  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-3 mb-4">
        <Upload className="text-[#22c55e]" />
        <h1 className="text-base font-semibold text-gray-900">
          Bulk Employee Import
        </h1>
      </div>

      {/* Step 1: Upload */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-semibold text-gray-900">1. Upload File</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => downloadTemplate("csv")}
              className="flex items-center gap-1 text-xs font-medium text-[#16a34a] hover:underline"
            >
              <Download size={13} /> CSV template
            </button>
            <button
              type="button"
              onClick={() => downloadTemplate("xlsx")}
              className="flex items-center gap-1 text-xs font-medium text-[#16a34a] hover:underline"
            >
              <Download size={13} /> Excel template
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          <strong>Accepted:</strong> CSV, Excel (.xlsx, .xls). Use <strong>any column names</strong> — you&apos;ll map them to fields in step 2.
        </p>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFile}
          className="block w-full text-xs text-gray-700 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#dcfce7] file:text-[#16a34a] hover:file:bg-[#dcfce7]"
        />

        {parseError && (
          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-1">Or paste CSV text directly:</p>
          <textarea
            placeholder="EMP ID,Employee Name,Work Email,Department,...&#10;1001,Rahul Verma,rahul@x.com,Engineering,..."
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              const parsed = parseCSV(e.target.value);
              setHeaders(parsed.headers);
              setRawRows(parsed.rows);
              setParseError(null);
            }}
            className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm font-mono"
            rows={6}
          />
        </div>
      </div>

      {/* Step 2: Map Columns */}
      {headers.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <h2 className="text-[13px] font-semibold text-gray-900 mb-1">
            2. Map Your Columns to HRMS Fields
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            We auto-detected mappings — review and adjust. Set unwanted columns to &quot;Skip&quot;.
            Required: First Name + Last Name <em>OR</em> Full Name.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-table-head text-gray-600 uppercase">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Your Column</th>
                  <th className="text-left px-3 py-2 font-medium">Sample Value</th>
                  <th className="text-left px-3 py-2 font-medium">Map To</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h) => {
                  const sample = rawRows[0]?.[h] ?? "";
                  return (
                    <tr key={h} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">{h}</td>
                      <td className="px-3 py-2 text-gray-600 text-xs font-mono truncate max-w-[200px]">
                        {sample || <span className="text-gray-400">empty</span>}
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={mapping[h] ?? "skip"}
                          onChange={(v) =>
                            setMapping({ ...mapping, [h]: v as CanonicalKey })
                          }
                          size="sm"
                          className="w-full"
                          searchable
                          options={CANONICAL_FIELDS.map((f) => ({
                            value: f.key,
                            label: f.required ? `${f.label} *` : f.label,
                          }))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!mappingValid && (
            <div className="mt-3 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800 flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                You must map either <strong>Full Name</strong>, or both{" "}
                <strong>First Name</strong> and <strong>Last Name</strong>.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Email warning */}
      {canonicalRows.length > 0 && mappingValid && rowsMissingEmail.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle size={18} className="text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-[13px] font-semibold text-orange-900">
                {rowsMissingEmail.length} row{rowsMissingEmail.length > 1 ? "s" : ""} missing email — will be skipped
              </h3>
              <p className="text-xs text-orange-800 mt-1">
                Each employee needs at least a Work Email or Personal Email. Rows below will not be imported until you provide an email.
              </p>
            </div>
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto bg-white rounded border border-orange-200 p-2 text-xs space-y-0.5">
            {rowsMissingEmail.map((r) => (
              <div key={r.row} className="flex gap-2">
                <span className="font-mono text-orange-600 w-12">#{r.row}</span>
                <span className="text-gray-800">{r.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {enrichedRows.length > 0 && mappingValid && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <h2 className="text-[13px] font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <FileText size={16} /> 3. Preview ({enrichedRows.length} rows)
          </h2>
          {Object.keys(subSheets).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {(Object.entries(subSheets) as Array<[string, Map<string, Record<string, string>[]>]>).map(([type, m]) => {
                const total = Array.from(m.values()).reduce((n, a) => n + a.length, 0);
                return (
                  <span key={type} className="text-[11px] font-medium bg-green-50 text-green-700 ring-1 ring-green-200 px-2 py-0.5 rounded">
                    {type}: {total} row{total === 1 ? "" : "s"} across {m.size} employee{m.size === 1 ? "" : "s"}
                  </span>
                );
              })}
            </div>
          )}
          {(() => {
            const ARRAY_KEYS = ["educations", "certifications", "pastExperiences", "familyMembers", "childrenDetails", "extraEmergencyContacts", "extraBankAccounts"];
            const sample = enrichedRows.slice(0, 20);
            const scalarKeys = Array.from(sample.reduce((set, r) => {
              Object.keys(r).forEach((k) => { if (!ARRAY_KEYS.includes(k)) set.add(k); });
              return set;
            }, new Set<string>()));
            const arrayKeysPresent = ARRAY_KEYS.filter((k) => sample.some((r) => Array.isArray((r as Record<string, unknown>)[k])));
            const allKeys = [...scalarKeys, ...arrayKeysPresent];
            return (
              <div className="overflow-auto max-h-[480px] mb-3 border border-gray-100 rounded">
                <table className="text-xs min-w-max">
                  <thead className="bg-gray-50 text-table-head text-gray-600 sticky top-0 z-10">
                    <tr>
                      <th className="text-left px-2 py-1 sticky left-0 bg-gray-50 z-20">#</th>
                      {allKeys.map((k) => (
                        <th key={k} className={"text-left px-2 py-1 whitespace-nowrap" + (arrayKeysPresent.includes(k) ? " bg-green-50 text-green-700" : "")}>{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sample.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50 align-top">
                        <td className="px-2 py-1 font-mono text-gray-500 sticky left-0 bg-white z-10">{i + 1}</td>
                        {allKeys.map((k) => {
                          const v = (r as Record<string, unknown>)[k];
                          if (Array.isArray(v)) {
                            return (
                              <td key={k} className="px-2 py-1 whitespace-nowrap text-green-700">
                                <details>
                                  <summary className="cursor-pointer font-semibold">{v.length} item{v.length === 1 ? "" : "s"}</summary>
                                  <ul className="mt-1 ml-3 list-disc space-y-0.5 text-gray-700 font-normal">
                                    {(v as Record<string, string>[]).map((item, idx) => (
                                      <li key={idx} className="whitespace-normal">
                                        {Object.entries(item).filter(([, val]) => val).map(([kk, vv]) => `${kk}: ${vv}`).join(" · ") || "(empty)"}
                                      </li>
                                    ))}
                                  </ul>
                                </details>
                              </td>
                            );
                          }
                          return (
                            <td key={k} className="px-2 py-1 whitespace-nowrap">{(v as string) || "—"}</td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
          {enrichedRows.length > 20 && (
            <p className="text-xs text-gray-500 mt-1 mb-3">
              ...and {enrichedRows.length - 20} more rows
            </p>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-gray-100">
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                />
                Dry run (validate only, don&apos;t insert)
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={markActive}
                  onChange={(e) => setMarkActive(e.target.checked)}
                  disabled={dryRun}
                />
                <span className={dryRun ? "text-gray-400" : ""}>
                  Import as <strong>Active</strong> (skip PreBoarding — for existing employees)
                </span>
              </label>
            </div>
            <button
              onClick={runImport}
              disabled={importMut.isPending || !!pendingImportId}
              className="btn btn-primary disabled:opacity-50 flex items-center gap-2"
            >
              {importMut.isPending
                ? "Queueing..."
                : pendingImportId
                  ? "Processing..."
                  : dryRun
                    ? "Validate"
                    : "Import"}
              {!importMut.isPending && !pendingImportId && <ArrowRight size={13} />}
            </button>
          </div>
        </div>
      )}

      {/* In-progress poll banner */}
      {pendingImportId && pollProgress && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-semibold text-green-900">
              Import {pollProgress.status === "ImportPending" ? "queued" : "processing"}…
            </h3>
            <span className="text-xs font-mono text-green-700">{pendingImportId}</span>
          </div>
          <div className="w-full bg-green-100 rounded h-2 overflow-hidden">
            <div
              className="bg-green-500 h-2 transition-all"
              style={{
                width:
                  pollProgress.totalRows > 0
                    ? `${Math.min(100, (pollProgress.processedRows / pollProgress.totalRows) * 100)}%`
                    : "0%",
              }}
            />
          </div>
          <div className="text-xs text-green-800 mt-2 flex gap-4">
            <span>Total: {pollProgress.totalRows}</span>
            <span>Processed: {pollProgress.processedRows}</span>
            <span className="text-green-700">OK: {pollProgress.successRows}</span>
            <span className="text-red-700">Failed: {pollProgress.failedRows}</span>
          </div>
          <p className="text-[11px] text-green-700 mt-1">Safe to leave page — refresh to resume polling.</p>
        </div>
      )}

      {/* Step 4: Result */}
      {result && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h2 className="text-[13px] font-semibold text-gray-900 mb-3">4. Result</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
              <CheckCircle className="text-green-600" size={20} />
              <div>
                <div className="text-xs text-green-700">Success</div>
                <div className="text-xl font-bold text-green-800">{result.success}</div>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
              <XCircle className="text-red-600" size={20} />
              <div>
                <div className="text-xs text-red-700">Failed</div>
                <div className="text-xl font-bold text-red-800">{result.failed}</div>
              </div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="text-xs text-gray-600">Import ID</div>
              <div className="font-mono text-xs">{result.importId}</div>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="text-yellow-600" size={14} />
                <h3 className="text-[13px] font-semibold text-gray-900">Errors</h3>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div
                    key={i}
                    className="text-xs bg-red-50 border border-red-200 rounded px-2 py-1"
                  >
                    Row {e.row}: {e.error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
