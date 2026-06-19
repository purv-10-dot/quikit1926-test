"use client";

import { useRef, useState } from "react";
import { X, Download, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { buildTemplateCsv, downloadBlob, parseImportCsv, TEMPLATE_HEADERS } from "./csv-utils";

interface Props {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}

interface ServerError {
  row: number;
  field: string;
  message: string;
}

interface ImportResponse {
  success: boolean;
  created?: number;
  errors?: ServerError[];
  error?: string;
}

const PREVIEW_LIMIT = 10;

export function ImportModal({ open, projectId, onClose, onImported }: Props) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [unknownHeaders, setUnknownHeaders] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<ServerError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [doneCount, setDoneCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  function reset() {
    setRows([]);
    setUnknownHeaders([]);
    setParseError(null);
    setServerErrors([]);
    setDoneCount(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFile(file: File) {
    reset();
    try {
      const text = await file.text();
      const { rows: parsed, unknownHeaders: unknown } = parseImportCsv(text);
      if (parsed.length === 0) {
        setParseError("File has no data rows.");
        return;
      }
      const titleMissing = parsed.some((r) => !r.title || !r.title.trim());
      if (titleMissing) {
        setParseError("Every row must have a non-empty `title` column.");
        return;
      }
      setRows(parsed);
      setUnknownHeaders(unknown);
    } catch {
      setParseError("Could not read the file. Make sure it's a valid CSV.");
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setServerErrors([]);
    try {
      const res = await fetch("/api/issues/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          rows: rows.map((r) => ({
            title: r.title,
            type: r.type || undefined,
            priority: r.priority || undefined,
            status: r.status || undefined,
            assigneeEmail: r.assigneeEmail || undefined,
            storyPoints: r.storyPoints || undefined,
            eta: r.eta || undefined,
            dueDate: r.dueDate || undefined,
            description: r.description || undefined,
          })),
        }),
      });
      const json = (await res.json()) as ImportResponse;
      if (!json.success) {
        setServerErrors(json.errors ?? [{ row: 0, field: "", message: json.error ?? "Import failed" }]);
        return;
      }
      setDoneCount(json.created ?? rows.length);
      onImported();
    } catch {
      setServerErrors([{ row: 0, field: "", message: "Network error" }]);
    } finally {
      setSubmitting(false);
    }
  }

  const headersToShow = rows.length > 0 ? Object.keys(rows[0]) : (TEMPLATE_HEADERS as readonly string[]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={handleClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-900">Import work items from CSV</h2>
          <button type="button" onClick={handleClose} className="rounded p-1 text-gray-500 hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {doneCount !== null ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="text-base text-gray-900">Imported {doneCount} work items.</p>
              <button
                type="button"
                onClick={handleClose}
                className="rounded bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex items-start gap-3 rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                <div className="flex-1">
                  <p className="font-medium">1. Download the template</p>
                  <p className="mt-1 text-xs text-gray-600">
                    Pre-filled with the right columns and one example row. Required: <code className="rounded bg-white px-1">title</code>. All others optional.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadBlob("quiktrack-import-template.csv", buildTemplateCsv())}
                  className="flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" />
                  Template
                </button>
              </div>

              <div className="mb-4 flex items-center gap-3 rounded border border-gray-200 p-3 text-sm">
                <span className="font-medium text-gray-900">2. Upload your CSV</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                  className="text-xs"
                />
                {rows.length > 0 && (
                  <button
                    type="button"
                    onClick={reset}
                    className="ml-auto rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                  >
                    Clear
                  </button>
                )}
              </div>

              {parseError && (
                <div className="mb-4 flex items-start gap-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {parseError}
                </div>
              )}

              {unknownHeaders.length > 0 && (
                <div className="mb-4 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  Ignored unknown columns: {unknownHeaders.join(", ")}
                </div>
              )}

              {serverErrors.length > 0 && (
                <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <p className="mb-2 font-medium">{serverErrors.length} row{serverErrors.length === 1 ? "" : "s"} need fixing — nothing was imported.</p>
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                    {serverErrors.slice(0, 50).map((e, i) => (
                      <li key={i}>
                        Row {e.row}{e.field ? ` (${e.field})` : ""}: {e.message}
                      </li>
                    ))}
                    {serverErrors.length > 50 && <li>… and {serverErrors.length - 50} more.</li>}
                  </ul>
                </div>
              )}

              {rows.length > 0 && (
                <>
                  <p className="mb-2 text-xs text-gray-600">
                    Preview — showing first {Math.min(PREVIEW_LIMIT, rows.length)} of {rows.length}:
                  </p>
                  <div className="overflow-x-auto rounded border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-gray-700">
                        <tr>
                          {headersToShow.map((h) => (
                            <th key={h} className="border-b border-gray-200 px-2 py-1.5 text-left font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, PREVIEW_LIMIT).map((r, i) => (
                          <tr key={i} className="border-b border-gray-100">
                            {headersToShow.map((h) => (
                              <td key={h} className="px-2 py-1.5 text-gray-700">{r[h] ?? ""}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {doneCount === null && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-5 py-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={rows.length === 0 || submitting}
              onClick={handleSubmit}
              className="flex items-center gap-1.5 rounded bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {submitting ? "Importing…" : `Import ${rows.length || ""}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
