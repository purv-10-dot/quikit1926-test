"use client";

import { useState } from "react";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/select";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Upload, Download, Users, CheckCircle2, AlertCircle } from "lucide-react";

interface ReqOption { id: string; title: string; requisitionNumber: string }
interface ParsedRow {
  firstName?: string; lastName?: string; email?: string; phone?: string;
  currentCompany?: string; currentDesignation?: string; totalExperience?: number;
  skills?: string[]; source?: string; location?: string; linkedinUrl?: string;
}
interface ImportResult { created: number; applied: number; skipped: number; failed: number; errors: { row: number; error: string }[] }

const TEMPLATE_HEADERS = [
  "First Name", "Last Name", "Email", "Phone", "Current Company",
  "Current Designation", "Total Experience (Years)", "Skills", "Source", "Location", "LinkedIn URL",
];
const MANDATORY_HEADERS = ["First Name", "Last Name", "Email"];
const SAMPLE_ROW = [
  "Rahul", "Verma", "rahul.verma@example.com", "9876543210", "Acme Corp",
  "Software Engineer", "4", "React, Node.js", "LinkedIn", "Pune, MH", "https://linkedin.com/in/rahulv",
];

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
function mapHeader(h: string): keyof ParsedRow | null {
  const n = norm(h);
  if (["firstname", "fname"].includes(n)) return "firstName";
  if (["lastname", "lname"].includes(n)) return "lastName";
  if (["email", "emailid", "emailaddress"].includes(n)) return "email";
  if (["phone", "mobile", "phonenumber", "contact"].includes(n)) return "phone";
  if (["currentcompany", "company"].includes(n)) return "currentCompany";
  if (["currentdesignation", "designation", "title", "jobtitle"].includes(n)) return "currentDesignation";
  if (["totalexperienceyears", "totalexperience", "experience", "experienceyears", "exp"].includes(n)) return "totalExperience";
  if (["skills", "skillset"].includes(n)) return "skills";
  if (["source", "sourceofhire"].includes(n)) return "source";
  if (["location", "city"].includes(n)) return "location";
  if (["linkedinurl", "linkedin"].includes(n)) return "linkedinUrl";
  return null;
}

function toRow(headers: string[], values: string[]): ParsedRow {
  const row: ParsedRow = {};
  headers.forEach((h, i) => {
    const key = mapHeader(h);
    const val = (values[i] ?? "").trim();
    if (!key || !val) return;
    if (key === "totalExperience") { const n = Number(val); if (Number.isFinite(n)) row.totalExperience = Math.round(n); }
    else if (key === "skills") row.skills = val.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    else (row as Record<string, unknown>)[key] = val;
  });
  return row;
}

// Minimal CSV line parser (handles double-quoted fields with commas).
function parseCsvLine(line: string): string[] {
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
  return out;
}

export function CandidateBulkImport({
  open, onClose, requisitions, onDone,
}: { open: boolean; onClose: () => void; requisitions: ReqOption[]; onDone: () => void }) {
  const api = useApiClient();
  const toast = useToast();
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [reqId, setReqId] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => { setRows([]); setFileName(""); setParseError(null); setReqId(""); setResult(null); };
  const close = () => { reset(); onClose(); };

  const downloadTemplate = async (format: "csv" | "xlsx") => {
    if (format === "csv") {
      const csv = [TEMPLATE_HEADERS.join(","), SAMPLE_ROW.join(",")].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "candidate-import-template.csv"; a.click();
      URL.revokeObjectURL(url);
    } else {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Candidates");
      ws.columns = TEMPLATE_HEADERS.map((h) => ({ header: h, key: h, width: Math.max(16, h.length + 4) }));
      ws.addRow(SAMPLE_ROW);
      const headerRow = ws.getRow(1);
      headerRow.font = { bold: true };
      // Mandatory columns → light red fill + note; optional → light gray.
      TEMPLATE_HEADERS.forEach((h, i) => {
        const required = MANDATORY_HEADERS.includes(h);
        const cell = headerRow.getCell(i + 1);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: required ? "FFFCE4E4" : "FFF2F2F2" } };
        cell.note = required ? "Required field" : "Optional field";
      });
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "candidate-import-template.xlsx"; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const onFile = async (file: File) => {
    setParseError(null); setResult(null); setFileName(file.name);
    try {
      let parsed: ParsedRow[] = [];
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) throw new Error("File has no data rows.");
        const headers = parseCsvLine(lines[0]).map((h) => h.trim());
        parsed = lines.slice(1).map((l) => toRow(headers, parseCsvLine(l)));
      } else {
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.worksheets[0];
        if (!ws) throw new Error("No sheet found.");
        const headers = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? "").trim());
        for (let r = 2; r <= ws.rowCount; r++) {
          const vals = (ws.getRow(r).values as unknown[]).slice(1).map((v) => (v == null ? "" : String(typeof v === "object" && "text" in (v as object) ? (v as { text: string }).text : v)));
          if (vals.some((v) => v.trim())) parsed.push(toRow(headers, vals));
        }
      }
      parsed = parsed.filter((r) => r.firstName || r.lastName || r.email);
      if (parsed.length === 0) throw new Error("No candidate rows found — check the column headers match the template.");
      setRows(parsed);
    } catch (e) {
      setRows([]);
      setParseError(e instanceof Error ? e.message : "Could not read the file.");
    }
  };

  const runImport = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      const res = await api.post<ImportResult>("/api/v1/hrms/recruit/candidates/bulk-import", {
        requisitionId: reqId || undefined,
        candidates: rows,
      });
      setResult(res.data ?? null);
      onDone();
      const c = res.data?.created ?? 0;
      toast.success(`${c} candidate${c === 1 ? "" : "s"} added`, res.data?.skipped ? `${res.data.skipped} skipped (already exist)` : undefined);
    } catch (e) {
      toast.error("Import failed", e instanceof Error ? e.message : undefined);
    } finally {
      setImporting(false);
    }
  };

  const validCount = rows.filter((r) => r.firstName && r.lastName && r.email).length;

  return (
    <Modal open={open} onClose={close} title="Bulk Add Candidates" size="lg" headerIcon={<Users size={18} />}>
      {result ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-green-50 ring-1 ring-green-200 p-3"><p className="text-xl font-bold text-green-700">{result.created}</p><p className="text-xs text-gray-500">Added</p></div>
            <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 p-3"><p className="text-xl font-bold text-amber-700">{result.skipped}</p><p className="text-xs text-gray-500">Skipped (exist)</p></div>
            <div className="rounded-lg bg-red-50 ring-1 ring-red-200 p-3"><p className="text-xl font-bold text-red-700">{result.failed}</p><p className="text-xs text-gray-500">Failed</p></div>
          </div>
          {result.applied > 0 && <p className="text-xs text-gray-600">{result.applied} candidate(s) applied to the selected requisition.</p>}
          {result.errors.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 p-3 space-y-1">
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 flex gap-1.5"><AlertCircle size={13} className="shrink-0 mt-0.5" /> Row {e.row}: {e.error}</p>
              ))}
            </div>
          )}
          <div className="flex justify-end pt-2 border-t border-gray-100">
            <button onClick={close} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium">Done</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">1. Download a template:</span>
            <button onClick={() => downloadTemplate("csv")} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md ring-1 ring-gray-200 hover:bg-gray-50 font-medium text-gray-700"><Download size={12} /> CSV</button>
            <button onClick={() => downloadTemplate("xlsx")} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md ring-1 ring-gray-200 hover:bg-gray-50 font-medium text-gray-700"><Download size={12} /> Excel</button>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1.5">2. Fill it, then upload (.csv or .xlsx)</p>
            <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-lg py-6 cursor-pointer hover:border-green-300 hover:bg-green-50/40 transition">
              <Upload size={16} className="text-gray-400" />
              <span className="text-sm text-gray-600">{fileName || "Choose a CSV or Excel file"}</span>
              <input type="file" accept=".csv,.xlsx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            </label>
            {parseError && <p className="mt-1.5 text-xs text-red-600">{parseError}</p>}
            {rows.length > 0 && (
              <p className="mt-1.5 text-xs text-green-700 flex items-center gap-1"><CheckCircle2 size={13} /> {validCount} valid candidate(s) ready{rows.length !== validCount ? ` (${rows.length - validCount} rows missing name/email)` : ""}.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Apply all to a requisition <span className="text-gray-400 font-normal">(optional)</span></label>
            <Select value={reqId} onChange={setReqId} placeholder="— No requisition (just add to pool) —"
              options={[{ value: "", label: "— No requisition (just add to pool) —" }, ...requisitions.map((r) => ({ value: r.id, label: `${r.title} (${r.requisitionNumber})` }))]} />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={close} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="button" onClick={runImport} disabled={validCount === 0 || importing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium disabled:opacity-50">
              <Upload size={13} /> {importing ? "Importing..." : `Import ${validCount || ""}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
