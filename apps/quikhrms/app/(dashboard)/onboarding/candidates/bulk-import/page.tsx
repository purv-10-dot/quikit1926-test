"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useApiClient } from "@/lib/hooks/use-api";
import { read, utils } from "xlsx";
import {
  Upload, FileText, CheckCircle, XCircle, AlertTriangle, Download, ArrowRight, ChevronLeft,
} from "lucide-react";
import { Select } from "@/components/hrms/select";
import { useDialog } from "@/components/hrms/dialog";
import { PageBackground } from "@/components/hrms/page-background";

interface ImportResult {
  importId: string;
  success: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
}
interface ImportEnqueueResponse { importId: string; status: string; totalRows: number }
type ImportStatusValue = "ImportPending" | "ImportProcessing" | "ImportCompleted" | "ImportFailed" | "ImportPartial";
interface ImportStatus {
  id: string; status: ImportStatusValue;
  totalRows: number; processedRows: number; successRows: number; failedRows: number;
  errors: Array<{ row: number; error: string }> | null; fileName: string;
}

type OnbKey =
  | "skip"
  | "firstName" | "lastName" | "workEmail" | "personalEmail" | "personalPhone"
  | "departmentName" | "jobTitle" | "sourceOfHire" | "dateOfJoining"
  | "panNumber" | "aadhaarNumber" | "uanNumber"
  | "previousExperienceMonths" | "highestQualification" | "skillSet";

const ONBOARDING_FIELDS: { key: OnbKey; label: string }[] = [
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "workEmail", label: "Official Email" },
  { key: "personalEmail", label: "Personal Email" },
  { key: "personalPhone", label: "Phone" },
  { key: "departmentName", label: "Department" },
  { key: "jobTitle", label: "Job Title" },
  { key: "sourceOfHire", label: "Source of Hire" },
  { key: "dateOfJoining", label: "Date of Joining" },
  { key: "panNumber", label: "PAN Number" },
  { key: "aadhaarNumber", label: "Aadhaar Number" },
  { key: "uanNumber", label: "UAN Number" },
  { key: "previousExperienceMonths", label: "Experience (Months)" },
  { key: "highestQualification", label: "Highest Qualification" },
  { key: "skillSet", label: "Skills" },
];

const MAP_OPTIONS = [
  { value: "skip", label: "— Ignore —" },
  ...ONBOARDING_FIELDS.map((f) => ({ value: f.key, label: f.label })),
];

const TEMPLATE_HEADERS = [
  "First Name", "Last Name", "Official Email", "Personal Email", "Phone",
  "Department", "Job Title", "Source of Hire", "Date of Joining",
  "PAN Number", "Aadhaar Number", "UAN Number",
  "Experience (Months)", "Highest Qualification", "Skills",
];
const MANDATORY_TEMPLATE_HEADERS = ["First Name", "Last Name", "Official Email"];

const SAMPLE_VALUES: Record<string, string> = {
  "First Name": "Sneha",
  "Last Name": "Kulkarni",
  "Official Email": "sneha.kulkarni@quikit.dev",
  "Personal Email": "sneha@personal.com",
  "Phone": "9876543210",
  "Department": "Engineering",
  "Job Title": "Software Engineer",
  "Source of Hire": "JobPortal",
  "Date of Joining": "2026-08-01",
  "PAN Number": "ABCDE1234F",
  "Aadhaar Number": "123456789012",
  "UAN Number": "100200300400",
  "Experience (Months)": "24",
  "Highest Qualification": "B.Tech Computer Science",
  "Skills": "React, Node.js, PostgreSQL",
};

// Things bulk import cannot set — shown in a popup after import.
const MANUAL_FOLLOWUP_FIELDS = [
  "Role & permissions",
  "Reporting manager",
  "Salary template & CTC (LPA)",
];

const HINTS: Record<Exclude<OnbKey, "skip">, string[]> = {
  firstName: ["firstname", "fname", "givenname"],
  lastName: ["lastname", "lname", "surname"],
  workEmail: ["officialemail", "workemail", "email", "companyemail", "emailid"],
  personalEmail: ["personalemail", "altemail"],
  personalPhone: ["phone", "mobile", "contact", "phonenumber", "mobilenumber"],
  departmentName: ["department", "dept"],
  jobTitle: ["jobtitle", "title", "designation", "role", "position"],
  sourceOfHire: ["sourceofhire", "source", "channel"],
  dateOfJoining: ["dateofjoining", "joiningdate", "doj", "joining"],
  panNumber: ["pannumber", "pan", "pancard"],
  aadhaarNumber: ["aadhaarnumber", "aadhaar", "aadhar", "aadharcard"],
  uanNumber: ["uannumber", "uan"],
  previousExperienceMonths: ["experiencemonths", "experience", "exp", "totalexperience"],
  highestQualification: ["highestqualification", "qualification", "education", "degree"],
  skillSet: ["skills", "skillset", "keyskills"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function autoMap(headers: string[]): Record<string, OnbKey> {
  const out: Record<string, OnbKey> = {};
  for (const h of headers) {
    const n = norm(h);
    let matched: OnbKey = "skip";
    for (const [key, hints] of Object.entries(HINTS) as [Exclude<OnbKey, "skip">, string[]][]) {
      if (hints.some((hint) => n === hint || n.includes(hint))) { matched = key; break; }
    }
    out[h] = matched;
  }
  return out;
}

const CLEAN = new Set(["", "na", "n/a", "-", "—", "null", "none"]);
const clean = (v: unknown): string => {
  const s = String(v ?? "").trim();
  return CLEAN.has(s.toLowerCase()) ? "" : s;
};

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const MAX_ROWS = 50;

export default function BulkOnboardingImportPage() {
  const api = useApiClient();
  const dialog = useDialog();
  const [fileName, setFileName] = useState("");
  const [rawText, setRawText] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, OnbKey>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pendingImportId, setPendingImportId] = useState<string | null>(null);
  const [pollProgress, setPollProgress] = useState<ImportStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (headers.length > 0) setMapping(autoMap(headers)); }, [headers]);

  useEffect(() => {
    if (!pendingImportId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await api.get<ImportStatus>(`/api/v1/hrms/onboarding/candidates/bulk-import/${pendingImportId}`);
        if (cancelled) return;
        setPollProgress(res.data);
        const terminal = ["ImportCompleted", "ImportFailed", "ImportPartial"].includes(res.data.status);
        if (terminal) {
          setResult({
            importId: res.data.id,
            success: res.data.successRows,
            failed: res.data.failedRows,
            errors: Array.isArray(res.data.errors) ? res.data.errors : [],
          });
          setPendingImportId(null);
          if (!dryRun && res.data.successRows > 0) {
            void dialog.alertDialog({
              title: `${res.data.successRows} candidate${res.data.successRows === 1 ? "" : "s"} imported — finish these manually`,
              description:
                "Bulk import creates onboarding candidates only. For each one, open their profile and set:\n\n" +
                MANUAL_FOLLOWUP_FIELDS.map((f) => `•  ${f}`).join("\n"),
              variant: "info",
              confirmLabel: "Got it",
            });
          }
        }
      } catch (err) { console.error("[poll] error:", err); }
    };
    tick();
    const handle = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(handle); };
  }, [pendingImportId, api, dryRun, dialog]);

  const ingest = (rows: Record<string, string>[], hdrs: string[]) => {
    setParseError(null);
    setResult(null);
    if (!hdrs.length || !rows.length) { setParseError("No rows found. Check the file/text has a header row + at least one data row."); return; }
    setHeaders(hdrs);
    setRawRows(rows);
  };

  const parseText = (text: string) => {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { headers: [], rows: [] };
    const hdrs = parseCSVLine(lines[0]);
    const rows = lines.slice(1).map((line) => {
      const cells = parseCSVLine(line);
      const r: Record<string, string> = {};
      hdrs.forEach((h, i) => { r[h] = clean(cells[i]); });
      return r;
    });
    return { headers: hdrs, rows };
  };

  const onFile = (file: File) => {
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    const reader = new FileReader();
    if (ext === "xlsx" || ext === "xls") {
      reader.onload = (ev) => {
        try {
          const wb = read(ev.target?.result as ArrayBuffer, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const aoa = utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
          if (!aoa.length) { ingest([], []); return; }
          const hdrs = (aoa[0] as unknown[]).map((c) => String(c ?? "").trim()).filter(Boolean);
          const rows = aoa.slice(1).map((arr) => {
            const r: Record<string, string> = {};
            hdrs.forEach((h, i) => { r[h] = clean((arr as unknown[])[i]); });
            return r;
          }).filter((r) => Object.values(r).some(Boolean));
          ingest(rows, hdrs);
        } catch { setParseError("Could not read this Excel file."); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (ev) => { const { headers: h, rows } = parseText(String(ev.target?.result ?? "")); ingest(rows, h); };
      reader.readAsText(file);
    }
  };

  const mappedKeys = useMemo(() => new Set<OnbKey>(Object.values(mapping).filter((k) => k !== "skip")), [mapping]);
  const missingRequired = ["firstName", "lastName", "workEmail"].filter((k) => !mappedKeys.has(k as OnbKey)) as OnbKey[];

  const canonicalRows = useMemo(() => {
    return rawRows.map((row) => {
      const c: Partial<Record<OnbKey, string>> = {};
      for (const [header, key] of Object.entries(mapping)) {
        if (key !== "skip" && row[header]) c[key] = row[header];
      }
      return c;
    });
  }, [rawRows, mapping]);

  const importable = useMemo(
    () => canonicalRows.filter((r) => r.firstName && r.lastName && r.workEmail),
    [canonicalRows],
  );
  const skipped = canonicalRows.length - importable.length;

  const runImport = async () => {
    if (importable.length === 0) return;
    setResult(null);
    setSubmitting(true);
    try {
      const res = await api.post<ImportEnqueueResponse>("/api/v1/hrms/onboarding/candidates/bulk-import", {
        fileName: fileName || "onboarding-candidates.csv",
        rows: importable.slice(0, MAX_ROWS),
        dryRun,
      });
      setPendingImportId(res.data.importId);
      setPollProgress({ id: res.data.importId, status: "ImportPending", totalRows: res.data.totalRows, processedRows: 0, successRows: 0, failedRows: 0, errors: null, fileName });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Import failed to start");
    } finally {
      setSubmitting(false);
    }
  };

  const downloadTemplate = async (format: "csv" | "xlsx") => {
    if (format === "csv") {
      const csv = [
        TEMPLATE_HEADERS.join(","),
        TEMPLATE_HEADERS.map((h) => SAMPLE_VALUES[h] ?? "").join(","),
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "onboarding-import-template.csv"; a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Candidates");
    ws.columns = TEMPLATE_HEADERS.map((h) => ({ header: h, key: h, width: Math.max(16, h.length + 4) }));
    ws.addRow(TEMPLATE_HEADERS.map((h) => SAMPLE_VALUES[h] ?? ""));
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true };
    TEMPLATE_HEADERS.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      const required = MANDATORY_TEMPLATE_HEADERS.includes(h);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: required ? "FFFCE4E4" : "FFF2F2F2" } };
      cell.note = required ? "Required field" : "Optional field";
    });
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "onboarding-import-template.xlsx"; a.click();
    URL.revokeObjectURL(url);
  };

  const busy = submitting || !!pendingImportId;

  return (
    <div className="max-w-5xl mx-auto px-5 py-4 space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center gap-2">
        <Link href="/onboarding" className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
          <ChevronLeft size={14} /> Back to Onboarding
        </Link>
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <div className="w-8 h-8 rounded-lg bg-[#166534]/5 text-[#166534] flex items-center justify-center"><Upload size={16} /></div>
        <h1 className="text-base font-semibold text-gray-900">Bulk Onboarding Import</h1>
      </div>

      {/* 1. Upload */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[13px] font-semibold text-gray-900">1. Upload File</h2>
          <div className="flex items-center gap-3">
            <button onClick={() => downloadTemplate("csv")} className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534] hover:underline"><Download size={13} /> CSV template</button>
            <button onClick={() => downloadTemplate("xlsx")} className="inline-flex items-center gap-1 text-xs font-semibold text-[#166534] hover:underline"><Download size={13} /> Excel template</button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-3">Accepted: CSV, Excel (.xlsx, .xls). Use <b>any column names</b> — you&apos;ll map them to fields in step 2. Max {MAX_ROWS} rows per import.</p>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22c55e] hover:bg-[#16a34a] text-white text-xs font-semibold cursor-pointer">
            <FileText size={13} /> Choose File
            <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
          </label>
          <span className="text-xs text-gray-500">{fileName || "No file chosen"}</span>
        </div>
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-1">Or paste CSV text directly:</p>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            onBlur={() => { if (rawText.trim()) { setFileName("pasted.csv"); const { headers: h, rows } = parseText(rawText); ingest(rows, h); } }}
            rows={4}
            placeholder="First Name,Last Name,Official Email,Department,...&#10;Sneha,Kulkarni,sneha@quikit.dev,Engineering,..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#166534]/20"
          />
        </div>
        {parseError && <div className="mt-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{parseError}</div>}
      </div>

      {/* 2. Map columns */}
      {headers.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h2 className="text-[13px] font-semibold text-gray-900 mb-1">2. Map Columns</h2>
          <p className="text-xs text-gray-500 mb-3">Match each column in your file to a field. First Name, Last Name and Official Email are required.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {headers.map((h) => (
              <div key={h} className="flex items-center gap-2">
                <span className="w-1/2 truncate text-xs font-medium text-gray-700" title={h}>{h}</span>
                <ArrowRight size={12} className="text-gray-300 shrink-0" />
                <div className="w-1/2">
                  <Select value={mapping[h] ?? "skip"} onChange={(v) => setMapping((m) => ({ ...m, [h]: v as OnbKey }))} options={MAP_OPTIONS} />
                </div>
              </div>
            ))}
          </div>
          {missingRequired.length > 0 && (
            <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-2">
              Map a column to: {missingRequired.map((k) => ONBOARDING_FIELDS.find((f) => f.key === k)?.label).join(", ")}
            </div>
          )}
        </div>
      )}

      {/* 3. Preview */}
      {headers.length > 0 && missingRequired.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h2 className="text-[13px] font-semibold text-gray-900 mb-1">3. Preview & Import</h2>
          <p className="text-xs text-gray-500 mb-3">
            {importable.length} candidate{importable.length === 1 ? "" : "s"} ready{skipped > 0 ? ` · ${skipped} row(s) skipped (missing name/email)` : ""}.
            {importable.length > MAX_ROWS && <span className="text-amber-700"> Only the first {MAX_ROWS} will be imported.</span>}
          </p>
          <div className="overflow-x-auto border border-gray-100 rounded-lg mb-3">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Official Email</th>
                  <th className="text-left px-3 py-2">Department</th>
                  <th className="text-left px-3 py-2">Joining</th>
                  <th className="text-left px-3 py-2">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {importable.slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-gray-900">{r.firstName} {r.lastName}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.workEmail}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.departmentName ?? "—"}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.dateOfJoining ?? "—"}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.sourceOfHire ?? "Direct"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="rounded text-[#22c55e]" />
              Dry run (validate only — don&apos;t create candidates)
            </label>
            <button onClick={runImport} disabled={busy || importable.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 px-4 py-1.5 text-xs font-semibold text-white">
              <Upload size={13} /> {busy ? "Working…" : dryRun ? "Validate" : "Import candidates"}
            </button>
          </div>
        </div>
      )}

      {/* Progress */}
      {pendingImportId && pollProgress && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h2 className="text-[13px] font-semibold text-gray-900 mb-2">Import {pollProgress.status === "ImportPending" ? "queued" : "processing"}…</h2>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div className="h-full bg-[#22c55e] transition-all" style={{ width: pollProgress.totalRows > 0 ? `${Math.min(100, (pollProgress.processedRows / pollProgress.totalRows) * 100)}%` : "0%" }} />
          </div>
          <div className="flex gap-4 text-xs text-gray-600">
            <span>Total: {pollProgress.totalRows}</span>
            <span>Processed: {pollProgress.processedRows}</span>
            <span className="text-green-700">OK: {pollProgress.successRows}</span>
            <span className="text-red-700">Failed: {pollProgress.failedRows}</span>
          </div>
        </div>
      )}

      {/* 4. Result */}
      {result && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <h2 className="text-[13px] font-semibold text-gray-900 mb-3">4. Result</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
              <CheckCircle className="text-green-600" size={20} />
              <div><div className="text-xs text-green-700">Success</div><div className="text-xl font-bold text-green-800">{result.success}</div></div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
              <XCircle className="text-red-600" size={20} />
              <div><div className="text-xs text-red-700">Failed</div><div className="text-xl font-bold text-red-800">{result.failed}</div></div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3"><div className="text-xs text-gray-600">Import ID</div><div className="font-mono text-xs truncate">{result.importId}</div></div>
          </div>
          {result.errors.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2"><AlertTriangle className="text-yellow-600" size={14} /><h3 className="text-[13px] font-semibold text-gray-900">Skipped / errors</h3></div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div key={i} className="text-xs bg-red-50 border border-red-200 rounded px-2 py-1">Row {e.row}: {e.error}</div>
                ))}
              </div>
            </div>
          )}
          {result.success > 0 && !dryRun && (
            <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-900 mb-1">Finish these manually per candidate</p>
              <ul className="text-[11px] text-amber-800 list-disc list-inside space-y-0.5">
                {MANUAL_FOLLOWUP_FIELDS.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <Link href="/onboarding" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">View onboarding</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
