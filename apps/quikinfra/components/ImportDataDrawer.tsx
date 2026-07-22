"use client";

/**
 * ImportDataDrawer — generic CSV / Excel importer with column mapping.
 *
 * Three-stage flow:
 *   1) Upload — user drags or picks a .csv/.xls/.xlsx file (max 5MB).
 *   2) Map    — one row per importable field; each row has a dropdown to
 *               pick which file column feeds it. Auto-mapped on open
 *               when the file's column header matches the field's label
 *               or key (case + spacing insensitive).
 *   3) Import — caller-provided `onImport(rows)` runs against the mapped
 *               rows. The drawer reports per-row progress and a final
 *               success/error summary.
 *
 * Caller responsibilities:
 *   - Define the `fields` list (key, label, required).
 *   - Implement `onImport` to actually create records — this drawer is
 *     transport-agnostic. The drawer handles parsing, mapping, and the
 *     progress UX; the caller handles POSTing, lookup-resolution
 *     (e.g. companyName → companyId), and any per-record validation.
 */

import { toErrorMessage, getErrorCode } from "@/lib/api/errors";
import { useEffect, useMemo, useRef, useState } from "react";
import { UploadCloud, X, AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "./PageShell";
import {
  SelectInput,
  RIGHT_DRAWER_BACKDROP,
  RIGHT_DRAWER_FRAME,
  RIGHT_DRAWER_PANEL,
} from "./FormDrawer";

// ─── Types ──────────────────────────────────────────────────────────

export interface ImportFieldDef {
  key: string;
  label: string;
  required?: boolean;
  /** Optional hint shown under the mapping row. */
  hint?: string;
}

export interface ImportRowResult {
  /** 1-based row number from the source file (header is row 1). */
  rowNumber: number;
  ok: boolean;
  /** Human-readable error message when ok=false. */
  error?: string;
}

interface ImportDataDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Singular entity name shown in the header — "Project", "Vendor", etc. */
  entityName: string;
  fields: ImportFieldDef[];
  /**
   * Receives one mapped row at a time keyed by `field.key`. Throw or
   * return `{ ok: false, error }` to mark the row as failed; the drawer
   * accumulates results and shows a per-row outcome at the end. Async
   * is fine — the drawer awaits each call sequentially so created
   * records are committed in file order.
   */
  onImport: (
    row: Record<string, string>,
  ) => Promise<{ ok: true } | { ok: false; error: string }> | { ok: true } | { ok: false; error: string };
  /** Hook to invalidate / refetch after a successful import. */
  onComplete?: () => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024;

// ─── Helpers ────────────────────────────────────────────────────────

/** Loose match used by the auto-mapper. Strips spaces, underscores, dashes
 *  and lowercases, so "Project Name", "project_name", "PROJECT-NAME"
 *  all collapse to the same canonical form. */
function normalizeKey(s: string): string {
  return String(s ?? "").toLowerCase().replace(/[\s_\-/]+/g, "");
}

function bestMatchColumn(field: ImportFieldDef, fileColumns: string[]): string {
  const targets = new Set([normalizeKey(field.key), normalizeKey(field.label)]);
  for (const c of fileColumns) {
    if (targets.has(normalizeKey(c))) return c;
  }
  return "";
}

async function parseFile(file: File): Promise<{ columns: string[]; rows: Record<string, string>[] }> {
  // Lazy-load the ~250 KB (gzipped) xlsx library only when a file is actually
  // parsed. Keeps it out of every route bundle that imports this drawer.
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const firstSheet = wb.SheetNames[0];
  if (!firstSheet) throw new Error("File has no sheets");
  const ws = wb.Sheets[firstSheet];
  if (!ws) throw new Error("Could not read first sheet");
  // `defval: ""` keeps blank cells in the row record so `Object.keys`
  // returns every column even when the first row has empty cells.
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
  if (rows.length === 0) {
    return { columns: [], rows: [] };
  }
  // Take column order from the first row's key order, which sheet_to_json
  // derives from the header row of the sheet — preserves the spreadsheet's
  // original left-to-right column order in the mapping UI.
  const columns = Object.keys(rows[0] as Record<string, unknown>);
  const stringRows = rows.map((r) => {
    const out: Record<string, string> = {};
    for (const col of columns) {
      const v = (r as Record<string, unknown>)[col];
      out[col] = v === null || v === undefined ? "" : String(v).trim();
    }
    return out;
  });
  return { columns, rows: stringRows };
}

// ─── Component ──────────────────────────────────────────────────────

type Stage = "upload" | "map" | "running" | "done";

export function ImportDataDrawer({
  open,
  onClose,
  entityName,
  fields,
  onImport,
  onComplete,
}: ImportDataDrawerProps) {
  const [stage, setStage] = useState<Stage>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parseError, setParseError] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  /** field.key → file column name. Empty string = unmapped. */
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [results, setResults] = useState<ImportRowResult[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounter = useRef(0);
  const [isDragging, setIsDragging] = useState(false);

  // Reset everything when the drawer closes so reopening starts fresh.
  useEffect(() => {
    if (!open) {
      setStage("upload");
      setFile(null);
      setParseError("");
      setColumns([]);
      setRows([]);
      setMapping({});
      setResults([]);
      setProgress({ done: 0, total: 0 });
      setIsDragging(false);
      dragCounter.current = 0;
    }
  }, [open]);

  // Lock the page scroll while the drawer is mounted.
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  // ── Stage 1: file pick ──────────────────────────────────────────

  const acceptFile = (f: File | null) => {
    setParseError("");
    if (!f) return;
    if (f.size > MAX_FILE_SIZE) {
      setParseError("File too large. Max 5 MB.");
      return;
    }
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xls", "xlsx"].includes(ext)) {
      setParseError("Unsupported file type. Use CSV, XLS, or XLSX.");
      return;
    }
    setFile(f);
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setIsDragging(false);
      dragCounter.current = 0;
    }
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    dragCounter.current = 0;
    const f = e.dataTransfer.files?.[0] ?? null;
    acceptFile(f);
  };

  const goToMapping = async () => {
    if (!file) return;
    setParsing(true);
    setParseError("");
    try {
      const { columns, rows } = await parseFile(file);
      if (columns.length === 0 || rows.length === 0) {
        setParseError("File has no data rows.");
        setParsing(false);
        return;
      }
      // Auto-map every field where the header matches its key/label.
      const auto: Record<string, string> = {};
      for (const f of fields) {
        auto[f.key] = bestMatchColumn(f, columns);
      }
      setColumns(columns);
      setRows(rows);
      setMapping(auto);
      setStage("map");
    } catch (e: unknown) {
      setParseError(toErrorMessage(e, "Could not parse file."));
    } finally {
      setParsing(false);
    }
  };

  // ── Stage 2: mapping ────────────────────────────────────────────

  const setFieldMapping = (fieldKey: string, column: string) => {
    setMapping((prev) => ({ ...prev, [fieldKey]: column }));
  };

  const missingRequired = fields
    .filter((f) => f.required && !mapping[f.key])
    .map((f) => f.label);

  const runImport = async () => {
    setStage("running");
    setProgress({ done: 0, total: rows.length });
    const out: ImportRowResult[] = [];
    for (let i = 0; i < rows.length; i++) {
      const src = rows[i]!;
      const mapped: Record<string, string> = {};
      for (const f of fields) {
        const col = mapping[f.key];
        mapped[f.key] = col ? (src[col] ?? "") : "";
      }
      try {
        const res = await onImport(mapped);
        out.push({ rowNumber: i + 2, ok: !!(res && res.ok), error: res && !res.ok ? res.error : undefined });
      } catch (e: unknown) {
        out.push({ rowNumber: i + 2, ok: false, error: toErrorMessage(e, "Failed") });
      }
      setProgress({ done: i + 1, total: rows.length });
    }
    setResults(out);
    setStage("done");
    if (out.some((r) => r.ok)) onComplete?.();
  };

  const successCount = results.filter((r) => r.ok).length;
  const failureCount = results.length - successCount;

  // ── Render ──────────────────────────────────────────────────────

  const optionList = [{ value: "", label: "— Skip / leave blank —" }, ...columns.map((c) => ({ value: c, label: c }))];

  return (
    <>
      <div className={RIGHT_DRAWER_BACKDROP} onClick={onClose} />
      <div className={RIGHT_DRAWER_FRAME}>
        <div className={`${RIGHT_DRAWER_PANEL} max-w-3xl`}>
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-accent-50 px-6 py-4 sm:px-8">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Import Data</h2>
            <p className="text-sm text-gray-500 mt-0.5">Upload &amp; map your data</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/70 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8">
          {stage === "upload" && (
            <>
              <label
                onDragEnter={onDragEnter}
                onDragLeave={onDragLeave}
                onDragOver={onDragOver}
                onDrop={onDrop}
                className={`block rounded-2xl border-2 border-dashed py-16 px-6 text-center cursor-pointer transition-colors ${
                  isDragging ? "border-accent-400 bg-accent-50" : "border-gray-300 bg-white hover:bg-gray-50"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  className="hidden"
                  onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
                />
                <div className="w-14 h-14 rounded-xl bg-accent-50 text-accent-500 flex items-center justify-center mx-auto mb-3">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-400 mt-1">CSV, XLS, XLSX (MAX. 5MB)</p>
              </label>

              {file && (
                <p className="text-center text-sm text-gray-700 mt-4">
                  Selected File: <span className="font-medium">{file.name}</span>
                </p>
              )}

              {parseError && (
                <div className="mt-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}

              <div className="flex justify-center mt-6">
                <PrimaryButton onClick={goToMapping} disabled={!file || parsing}>
                  {parsing ? "Reading file…" : "Upload"}
                </PrimaryButton>
              </div>
            </>
          )}

          {stage === "map" && (
            <>
              <div className="flex items-center gap-3 mb-4 px-3 py-2 rounded-lg bg-accent-50 border border-accent-100 text-xs text-accent-800">
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>
                  Detected <span className="font-semibold">{rows.length}</span> rows in{" "}
                  <span className="font-medium">{file?.name}</span>. Map each {entityName.toLowerCase()} field to a
                  column from your file.
                </span>
              </div>

              <div className="space-y-3">
                {fields.map((f) => {
                  const auto = mapping[f.key];
                  return (
                    <div
                      key={f.key}
                      className="grid grid-cols-2 gap-4 items-start"
                    >
                      <div className="pt-2">
                        <p className="text-sm font-medium text-gray-900">
                          {f.label}
                          {f.required && <span className="text-red-500 ml-0.5">*</span>}
                        </p>
                        {f.hint && <p className="text-xs text-gray-400 mt-0.5">{f.hint}</p>}
                      </div>
                      <SelectInput
                        value={auto ?? ""}
                        onChange={(v) => setFieldMapping(f.key, v)}
                        placeholder="Choose a column…"
                        options={optionList}
                      />
                    </div>
                  );
                })}
              </div>

              {missingRequired.length > 0 && (
                <div className="mt-5 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Map a column for the required field{missingRequired.length > 1 ? "s" : ""}:{" "}
                    <strong>{missingRequired.join(", ")}</strong>.
                  </span>
                </div>
              )}

              {/* Preview first 5 rows */}
              <div className="mt-6">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Preview (first 5 rows)
                </h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          {fields.map((f) => (
                            <th key={f.key} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">
                              {f.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {rows.slice(0, 5).map((r, i) => (
                          <tr key={i}>
                            {fields.map((f) => {
                              const col = mapping[f.key];
                              const cell = col ? r[col] : "";
                              return (
                                <td key={f.key} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                                  {cell || <span className="text-gray-300">—</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {stage === "running" && (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-600">
              <Loader2 className="w-8 h-8 animate-spin text-accent-500" />
              <p className="text-sm font-medium">
                Importing {progress.done} / {progress.total}…
              </p>
              <div className="w-72 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-500 transition-all"
                  style={{
                    width: progress.total > 0 ? `${(progress.done / progress.total) * 100}%` : "0%",
                  }}
                />
              </div>
            </div>
          )}

          {stage === "done" && (
            <>
              <div className="flex items-center gap-3 mb-4">
                {failureCount === 0 ? (
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                ) : (
                  <AlertTriangle className="w-6 h-6 text-amber-600" />
                )}
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {successCount} imported, {failureCount} failed
                  </p>
                  <p className="text-xs text-gray-500">
                    {failureCount === 0 ? "All rows were created successfully." : "Review the failures below and fix the source file."}
                  </p>
                </div>
              </div>

              {failureCount > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Row</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-600">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {results
                        .filter((r) => !r.ok)
                        .map((r) => (
                          <tr key={r.rowNumber}>
                            <td className="px-3 py-2 text-gray-600">{r.rowNumber}</td>
                            <td className="px-3 py-2 text-red-600">{r.error}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 bg-white px-6 py-5 sm:px-8">
          {stage === "upload" && (
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          )}
          {stage === "map" && (
            <>
              <SecondaryButton onClick={() => setStage("upload")}>Back</SecondaryButton>
              <PrimaryButton onClick={runImport} disabled={missingRequired.length > 0}>
                Import {rows.length} row{rows.length === 1 ? "" : "s"}
              </PrimaryButton>
            </>
          )}
          {stage === "running" && (
            <SecondaryButton onClick={onClose} disabled>
              Importing…
            </SecondaryButton>
          )}
          {stage === "done" && <PrimaryButton onClick={onClose}>Close</PrimaryButton>}
        </div>
        </div>
      </div>
    </>
  );
}
