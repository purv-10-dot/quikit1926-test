"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import {
  Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, Loader2, AlertTriangle,
} from "lucide-react";
import { clsx } from "clsx";

interface EmployeeLite {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
}

interface ParsedRow {
  rowNum: number;             // 1-indexed (row 1 = header)
  employeeCode: string;
  employeeId: string | null;
  employeeName: string | null;
  financialYear: string;
  periodStart: string;        // ISO YYYY-MM-DD
  periodEnd: string;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  epfEmployee: number;
  epfEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  professionalTax: number;
  tds: number;
  notes: string | null;
  errors: string[];
}

interface ImportResult {
  total: number;
  succeeded: number;
  failed: number;
  results: { employeeId: string; periodStart: string; success: boolean; error?: string }[];
}

const TEMPLATE_HEADERS = [
  "EmployeeCode",
  "FinancialYear",
  "PeriodStart",
  "PeriodEnd",
  "GrossEarnings",
  "TotalDeductions",
  "NetPay",
  "EPFEmployee",
  "EPFEmployer",
  "ESIEmployee",
  "ESIEmployer",
  "ProfessionalTax",
  "TDS",
  "Notes",
];

const TEMPLATE_SAMPLE = [
  "QK-EMP-0001,2026-27,2026-04-01,2026-04-30,50000,8200,41800,6000,6000,0,0,200,2000,Previous employer salary",
  "QK-EMP-0001,2026-27,2026-05-01,2026-05-31,50000,8200,41800,6000,6000,0,0,200,2000,",
].join("\n");

// Minimal RFC-4180 CSV parser — handles quoted fields, escaped quotes ("")
// inside quoted fields, and CRLF/LF line endings.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { row.push(field); field = ""; i++; continue; }
    if (ch === "\r") { i++; continue; }
    if (ch === "\n") {
      row.push(field); field = ""; rows.push(row); row = []; i++; continue;
    }
    field += ch; i++;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === "")) rows.pop();
  return rows;
}

// Accept ISO (2026-04-30), DD/MM/YYYY, or DD-MM-YYYY (common Excel exports).
function parseDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) return `${dash[3]}-${dash[2].padStart(2, "0")}-${dash[1].padStart(2, "0")}`;
  return null;
}

// Strip ₹, commas, whitespace before numeric parse.
function parseNum(raw: string): number {
  const s = (raw ?? "").replace(/[,₹\s]/g, "").trim();
  if (s === "") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function PriorPayrollUpload() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // Fetch employees to resolve employeeCode → id. Done once; cached for
  // the session. Limit 500 covers any realistic prior-payroll batch.
  const { data: empData } = useQuery({
    queryKey: ["employees", "lite-for-prior-payroll"],
    queryFn: () => api.get<EmployeeLite[]>("/api/v1/hrms/employees?limit=500&picker=1"),
  });
  const employees = empData?.data ?? [];
  const empByCode = useMemo(() => {
    const m = new Map<string, EmployeeLite>();
    for (const e of employees) m.set(e.employeeCode.toUpperCase(), e);
    return m;
  }, [employees]);

  const uploadMut = useMutation({
    mutationFn: (rows: Record<string, unknown>[]) =>
      api.post<ImportResult>("/api/v1/hrms/payroll/prior-payroll/records", { records: rows }),
    onSuccess: (res) => {
      setResult(res.data);
      qc.invalidateQueries({ queryKey: ["payroll", "prior-payroll"] });
      qc.invalidateQueries({ queryKey: ["payroll", "prior-payroll-records"] });
      const r = res.data;
      if (r.failed === 0) toast.success("All records imported", `${r.succeeded} saved`);
      else toast.error("Partial import", `${r.succeeded} of ${r.total} saved; ${r.failed} failed`);
    },
  });

  const downloadTemplate = () => {
    const csv = TEMPLATE_HEADERS.join(",") + "\n" + TEMPLATE_SAMPLE + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prior-payroll-template.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    setResult(null);
    setParsed(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        toast.error("Empty CSV", "Need at least one data row after the header");
        return;
      }
      const headers = rows[0].map((h) => h.trim().toLowerCase());
      const idx = (name: string) => headers.indexOf(name.toLowerCase());
      const required = ["employeecode", "financialyear", "periodstart", "periodend", "grossearnings"];
      const missing = required.filter((r) => idx(r) === -1);
      if (missing.length) {
        toast.error("Missing columns", `Required: ${missing.join(", ")}`);
        return;
      }

      const dataRows = rows.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
      if (dataRows.length === 0) {
        toast.error("No data rows", "The CSV has a header but no records");
        return;
      }
      if (dataRows.length > 5000) {
        toast.error("Too many rows", `Max 5000 records per upload; got ${dataRows.length}`);
        return;
      }

      const num = (cells: string[], col: string): number => {
        const j = idx(col);
        if (j === -1) return 0;
        const v = parseNum(cells[j] ?? "0");
        return Number.isFinite(v) ? v : 0;
      };

      const out: ParsedRow[] = dataRows.map((cells, i) => {
        const rowNum = i + 2; // header = row 1
        const errors: string[] = [];

        const employeeCode = (cells[idx("employeecode")] ?? "").trim();
        const emp = employeeCode ? empByCode.get(employeeCode.toUpperCase()) ?? null : null;
        if (!employeeCode) errors.push("EmployeeCode missing");
        else if (!emp) errors.push(`No employee with code "${employeeCode}"`);

        const fy = (cells[idx("financialyear")] ?? "").trim();
        if (!fy) errors.push("FinancialYear missing");

        const periodStart = parseDate(cells[idx("periodstart")] ?? "");
        const periodEnd = parseDate(cells[idx("periodend")] ?? "");
        if (!periodStart) errors.push("PeriodStart invalid (use YYYY-MM-DD)");
        if (!periodEnd) errors.push("PeriodEnd invalid (use YYYY-MM-DD)");
        if (periodStart && periodEnd && periodEnd < periodStart) {
          errors.push("PeriodEnd is before PeriodStart");
        }

        const grossRaw = parseNum(cells[idx("grossearnings")] ?? "0");
        if (!Number.isFinite(grossRaw) || grossRaw < 0) errors.push("GrossEarnings invalid");

        return {
          rowNum,
          employeeCode,
          employeeId: emp?.id ?? null,
          employeeName: emp ? `${emp.firstName} ${emp.lastName}` : null,
          financialYear: fy,
          periodStart: periodStart ?? "",
          periodEnd: periodEnd ?? "",
          grossEarnings: Number.isFinite(grossRaw) ? grossRaw : 0,
          totalDeductions: num(cells, "totaldeductions"),
          netPay: num(cells, "netpay"),
          epfEmployee: num(cells, "epfemployee"),
          epfEmployer: num(cells, "epfemployer"),
          esiEmployee: num(cells, "esiemployee"),
          esiEmployer: num(cells, "esiemployer"),
          professionalTax: num(cells, "professionaltax"),
          tds: num(cells, "tds"),
          notes: ((cells[idx("notes")] ?? "").trim() || null),
          errors,
        };
      });
      setParsed(out);
    } catch (e) {
      toast.error("Could not read CSV", (e as Error).message);
    }
  };

  const submit = () => {
    if (!parsed) return;
    const valid = parsed.filter((p) => p.errors.length === 0 && p.employeeId);
    if (valid.length === 0) return;
    uploadMut.mutate(
      valid.map((p) => ({
        employeeId: p.employeeId!,
        financialYear: p.financialYear,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        grossEarnings: p.grossEarnings,
        totalDeductions: p.totalDeductions,
        netPay: p.netPay,
        epfEmployee: p.epfEmployee,
        epfEmployer: p.epfEmployer,
        esiEmployee: p.esiEmployee,
        esiEmployer: p.esiEmployer,
        professionalTax: p.professionalTax,
        tds: p.tds,
        notes: p.notes,
      })),
    );
  };

  const clear = () => {
    setParsed(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const validCount = parsed?.filter((p) => p.errors.length === 0).length ?? 0;
  const invalidCount = (parsed?.length ?? 0) - validCount;

  return (
    <div className="rounded-md border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-gray-900 flex items-center gap-1.5">
            <FileSpreadsheet size={15} className="text-green-600" />
            Upload YTD payroll records
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            CSV of what each employee was paid in their previous payroll system this FY. Up to 5000 rows per upload.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 rounded text-xs font-medium"
        >
          <Download size={13} /> Download Template
        </button>
      </div>

      {/* Step 1 — empty state: choose file */}
      {!parsed && !result && (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
          <Upload size={20} className="mx-auto text-gray-400 mb-2" />
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium"
          >
            <Upload size={13} /> Choose CSV
          </button>
          <p className="text-[11px] text-gray-500 mt-2">
            Required columns: EmployeeCode · FinancialYear · PeriodStart · PeriodEnd · GrossEarnings.
            Date formats accepted: <code className="bg-white px-1 rounded">YYYY-MM-DD</code>, <code className="bg-white px-1 rounded">DD/MM/YYYY</code>, <code className="bg-white px-1 rounded">DD-MM-YYYY</code>.
          </p>
        </div>
      )}

      {/* Step 2 — preview parsed rows */}
      {parsed && !result && (
        <>
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 size={12} /> {validCount} valid
            </span>
            {invalidCount > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-700">
                <XCircle size={12} /> {invalidCount} invalid (skipped)
              </span>
            )}
            <button onClick={clear} className="ml-auto text-xs text-gray-500 hover:text-gray-700 underline">
              Reset
            </button>
          </div>

          <div className="rounded border border-gray-200 max-h-96 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="text-left py-1.5 px-2 font-semibold text-gray-600">#</th>
                  <th className="text-left py-1.5 px-2 font-semibold text-gray-600">Employee</th>
                  <th className="text-left py-1.5 px-2 font-semibold text-gray-600">Period</th>
                  <th className="text-right py-1.5 px-2 font-semibold text-gray-600">Gross</th>
                  <th className="text-right py-1.5 px-2 font-semibold text-gray-600">TDS</th>
                  <th className="text-right py-1.5 px-2 font-semibold text-gray-600">Net</th>
                  <th className="text-left py-1.5 px-2 font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((p) => (
                  <tr key={p.rowNum} className={clsx("border-t border-gray-100", p.errors.length > 0 && "bg-rose-50/40")}>
                    <td className="py-1.5 px-2 text-gray-500 tabular-nums">{p.rowNum}</td>
                    <td className="py-1.5 px-2">
                      <p className="font-medium text-gray-900">{p.employeeName ?? (p.employeeCode || "—")}</p>
                      {p.employeeName && <p className="text-[10px] text-gray-500">{p.employeeCode}</p>}
                    </td>
                    <td className="py-1.5 px-2 text-gray-700">
                      {p.periodStart || "—"} → {p.periodEnd || "—"}
                    </td>
                    <td className="py-1.5 px-2 text-right text-gray-900 tabular-nums">
                      {Number.isFinite(p.grossEarnings) ? p.grossEarnings.toLocaleString("en-IN") : "—"}
                    </td>
                    <td className="py-1.5 px-2 text-right text-gray-700 tabular-nums">
                      {p.tds.toLocaleString("en-IN")}
                    </td>
                    <td className="py-1.5 px-2 text-right text-gray-700 tabular-nums">
                      {p.netPay.toLocaleString("en-IN")}
                    </td>
                    <td className="py-1.5 px-2">
                      {p.errors.length === 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-emerald-700">
                          <CheckCircle2 size={11} /> OK
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-0.5 text-rose-700"
                          title={p.errors.join("; ")}
                        >
                          <AlertTriangle size={11} /> {p.errors[0]}
                          {p.errors.length > 1 && ` (+${p.errors.length - 1})`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={clear}
              className="px-3 py-1.5 text-xs border border-gray-300 bg-white hover:bg-gray-50 rounded text-gray-700 font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={validCount === 0 || uploadMut.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded text-xs font-medium"
            >
              {uploadMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploadMut.isPending
                ? "Uploading…"
                : `Upload ${validCount} record${validCount !== 1 ? "s" : ""}`}
            </button>
          </div>
        </>
      )}

      {/* Step 3 — result */}
      {result && (
        <div className="space-y-2">
          <div
            className={clsx(
              "rounded border px-3 py-2 text-xs",
              result.failed === 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-900",
            )}
          >
            <p className="font-bold">
              {result.failed === 0
                ? `All ${result.succeeded} records imported`
                : `${result.succeeded} of ${result.total} records imported · ${result.failed} failed`}
            </p>
          </div>
          {result.failed > 0 && (
            <div className="rounded border border-gray-200 max-h-48 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-1.5 px-2 font-semibold text-gray-600">Employee ID</th>
                    <th className="text-left py-1.5 px-2 font-semibold text-gray-600">Period Start</th>
                    <th className="text-left py-1.5 px-2 font-semibold text-gray-600">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results
                    .filter((r) => !r.success)
                    .map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-1.5 px-2 text-gray-700 font-mono text-[11px]">{r.employeeId}</td>
                        <td className="py-1.5 px-2 text-gray-700">{r.periodStart}</td>
                        <td className="py-1.5 px-2 text-rose-700">{r.error ?? "Unknown error"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={clear}
              className="px-3 py-1.5 text-xs border border-gray-300 bg-white hover:bg-gray-50 rounded text-gray-700 font-medium"
            >
              Upload another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
