"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { read, utils } from "xlsx";
import { Upload, CheckCircle, XCircle, AlertTriangle, Download, ArrowRight, Building2 } from "lucide-react";

interface BankRow {
  employeeCode: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  ifscCode: string;
  branch: string;
  accountType: string;
}

interface ImportResult {
  total: number;
  updated: number;
  failed: number;
  errors: Array<{ row: number; employeeCode: string; error: string }>;
}

const HEADER_ALIASES: Record<keyof BankRow, string[]> = {
  employeeCode: ["emp id", "empid", "employee code", "code", "employee id"],
  bankName: ["bank name", "bank"],
  accountNumber: ["account number", "account no", "accno", "a/c number"],
  accountHolder: ["account holder name", "account holder", "holder name"],
  ifscCode: ["ifsc code", "ifsc"],
  branch: ["branch name", "branch"],
  accountType: ["account type", "type"],
};

function pickColumn(row: Record<string, string>, aliases: string[]): string {
  for (const a of aliases) {
    const found = Object.keys(row).find((k) => k.trim().toLowerCase() === a.toLowerCase());
    if (found && row[found]) return row[found].trim();
  }
  return "";
}

function rowsToBank(raw: Record<string, string>[]): BankRow[] {
  return raw
    .map((r) => ({
      employeeCode: pickColumn(r, HEADER_ALIASES.employeeCode),
      bankName: pickColumn(r, HEADER_ALIASES.bankName),
      accountNumber: pickColumn(r, HEADER_ALIASES.accountNumber),
      accountHolder: pickColumn(r, HEADER_ALIASES.accountHolder),
      ifscCode: pickColumn(r, HEADER_ALIASES.ifscCode),
      branch: pickColumn(r, HEADER_ALIASES.branch),
      accountType: pickColumn(r, HEADER_ALIASES.accountType) || "Savings",
    }))
    .filter((r) => r.employeeCode && r.accountNumber);
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ""; });
    return obj;
  });
}

function parseExcel(buffer: ArrayBuffer): Record<string, string>[] {
  const wb = read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  return utils.sheet_to_json<Record<string, string>>(wb.Sheets[sheetName], { defval: "" });
}

export default function BulkBankImportPage() {
  const api = useApiClient();
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<BankRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const importMut = useMutation({
    mutationFn: (body: { rows: BankRow[] }) =>
      api.post<ImportResult>("/api/v1/hrms/employees/bulk-bank-import", body),
    onSuccess: (res) => setResult(res.data),
  });

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
        const raw = isExcel
          ? parseExcel(ev.target?.result as ArrayBuffer)
          : parseCSV(ev.target?.result as string);
        const banks = rowsToBank(raw as Record<string, string>[]);
        setRows(banks);
        if (banks.length === 0) setParseError("No valid rows found. Check Emp ID + Account Number columns.");
      } catch (err) {
        setParseError(err instanceof Error ? err.message : "Failed to parse file");
        setRows([]);
      }
    };
    reader.onerror = () => setParseError("Failed to read file");
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const headers = ["Emp ID", "Bank Name", "Branch Name", "Account Number", "Account Holder Name", "IFSC Code", "Account Type"];
    const sample = ["1001", "HDFC Bank LTD", "Indore Branch", "50100013830070", "Nilesh Yadav", "HDFC0001772", "Savings"];
    const csv = [headers.join(","), sample.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bank-details-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = () => {
    if (rows.length === 0) return;
    setResult(null);
    importMut.mutate({ rows });
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <Building2 className="text-[#3b82f6]" />
        <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">
          Bulk Bank Details Import
        </h1>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">1. Upload Bank CSV</h2>
          <button onClick={downloadTemplate} className="flex items-center gap-1 text-xs text-[#2563eb] hover:underline">
            <Download size={12} /> Download Template
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          CSV/Excel must include columns: <strong>Emp ID</strong>, <strong>Account Number</strong>. Others optional.
          Existing employees matched by <strong>Emp ID</strong>. Existing bank info overwritten.
        </p>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFile}
          className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#dbeafe] file:text-[#2563eb] hover:file:bg-[#dbeafe]"
        />
        {parseError && (
          <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{parseError}</span>
          </div>
        )}
        {fileName && rows.length > 0 && (
          <p className="mt-2 text-xs text-emerald-700">
            ✓ Loaded <strong>{rows.length}</strong> rows from <code className="font-mono">{fileName}</code>
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-4">
          <h2 className="font-semibold text-gray-900 mb-3">2. Preview ({rows.length} rows)</h2>
          <div className="overflow-x-auto mb-3 border border-gray-100 rounded">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-2 py-1">Emp ID</th>
                  <th className="text-left px-2 py-1">Bank</th>
                  <th className="text-left px-2 py-1">Account No</th>
                  <th className="text-left px-2 py-1">Holder</th>
                  <th className="text-left px-2 py-1">IFSC</th>
                  <th className="text-left px-2 py-1">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1 font-mono">{r.employeeCode}</td>
                    <td className="px-2 py-1">{r.bankName || "—"}</td>
                    <td className="px-2 py-1 font-mono">{r.accountNumber}</td>
                    <td className="px-2 py-1">{r.accountHolder || "—"}</td>
                    <td className="px-2 py-1 font-mono">{r.ifscCode || "—"}</td>
                    <td className="px-2 py-1">{r.accountType || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 20 && (
              <p className="text-xs text-gray-500 p-2">...and {rows.length - 20} more</p>
            )}
          </div>
          <div className="flex justify-end pt-3 border-t border-gray-100">
            <button
              onClick={runImport}
              disabled={importMut.isPending}
              className="btn btn-primary disabled:opacity-50 flex items-center gap-2"
            >
              {importMut.isPending ? "Importing..." : "Import"}
              {!importMut.isPending && <ArrowRight size={14} />}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">3. Result</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
              <CheckCircle className="text-green-600" size={20} />
              <div>
                <div className="text-xs text-green-700">Updated</div>
                <div className="text-xl font-bold text-green-800">{result.updated}</div>
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
              <div className="text-xs text-gray-600">Total</div>
              <div className="text-xl font-bold">{result.total}</div>
            </div>
          </div>
          {result.errors.length > 0 && (
            <div>
              <h3 className="font-medium text-gray-900 text-sm mb-2 flex items-center gap-1">
                <AlertTriangle size={14} className="text-yellow-600" /> Errors
              </h3>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div key={i} className="text-xs bg-red-50 border border-red-200 rounded px-2 py-1">
                    Row {e.row} ({e.employeeCode}): {e.error}
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
