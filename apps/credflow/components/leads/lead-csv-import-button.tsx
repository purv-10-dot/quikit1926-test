"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";
import { LeadsImportSampleDownload } from "@/components/leads/leads-import-sample-download";
import { parseCsv } from "@/lib/services/import/csv-processor";
import { IMPORTABLE_STANDARD_KEYS } from "@/lib/services/import/lead-field-mapping";
import {
  STANDARD_LEAD_FIELDS,
  STANDARD_KEYS,
  type LeadFieldDefinition,
} from "@/types/field-definition";

interface ImportResult {
  status?: string;
  totalRows: number;
  importedCount: number;
  createdCount: number;
  updatedCount: number;
  rowErrors: Array<{ row: number; error: string }>;
}

interface MapField {
  key: string;
  label: string;
  required: boolean;
  custom: boolean;
}

/** Read a chosen file into CSV text. Spreadsheets are converted client-side via the xlsx lib. */
async function fileToCsvText(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const first = wb.SheetNames[0];
    if (!first) throw new Error("That spreadsheet has no sheets.");
    return XLSX.utils.sheet_to_csv(wb.Sheets[first]!);
  }
  return file.text();
}

const lc = (s: string) => s.trim().toLowerCase();

export function LeadCsvImportButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Parsed file + mapping state (step "map")
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [fields, setFields] = useState<MapField[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({}); // fieldKey -> csvHeader

  const [result, setResult] = useState<ImportResult | null>(null);

  function resetAll() {
    setBusy(false);
    setFileName("");
    setCsvText("");
    setHeaders([]);
    setPreview([]);
    setFields([]);
    setMapping({});
    setResult(null);
  }
  function close() {
    if (busy) return;
    resetAll();
    setOpen(false);
  }

  async function onFileChosen(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const text = await fileToCsvText(file);
      const { headers: hdrs, rows } = parseCsv(text);
      if (hdrs.length === 0 || rows.length === 0) {
        throw new Error("No data rows found in that file.");
      }

      // Custom fields come from the live config; standard fields are always available.
      let customs: LeadFieldDefinition[] = [];
      try {
        const fres = await fetch("/api/settings/fields?customOnly=true", { credentials: "include" });
        if (fres.ok) {
          const fjson = (await fres.json()) as { items?: LeadFieldDefinition[] };
          customs = (fjson.items ?? []).filter((d) => !d.isStandard && !STANDARD_KEYS.has(d.key));
        }
      } catch {
        /* standard fields still work without the custom list */
      }

      const standard = STANDARD_LEAD_FIELDS.filter((d) => IMPORTABLE_STANDARD_KEYS.has(d.key));
      const ordered: MapField[] = [
        ...standard.filter((d) => d.key === "name"),
        ...standard.filter((d) => d.key !== "name"),
        ...customs,
      ].map((d) => ({ key: d.key, label: d.label, required: d.key === "name", custom: !d.isStandard }));

      // Auto-suggest: match each field to a header by key or label (case-insensitive).
      const auto: Record<string, string> = {};
      for (const f of ordered) {
        const hit = hdrs.find((h) => lc(h) === lc(f.key) || lc(h) === lc(f.label));
        if (hit) auto[f.key] = hit;
      }

      setFileName(file.name);
      setCsvText(text);
      setHeaders(hdrs);
      setPreview(rows.slice(0, 5));
      setFields(ordered);
      setMapping(auto);
      setResult(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  const nameMapped = Boolean(mapping["name"]);
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  async function doImport() {
    setBusy(true);
    setResult(null);
    try {
      // UI maps field -> header; the API wants header -> fieldKey.
      const columnMap: Record<string, string> = {};
      for (const [fieldKey, header] of Object.entries(mapping)) {
        if (header) columnMap[header] = fieldKey;
      }
      const res = await fetch("/api/imports/queue/leads", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName, csvText, sourceSystem: "ui-upload", columnMap }),
      });
      const json = (await res.json()) as Partial<ImportResult> & { error?: string; jobId?: string };
      if (!res.ok) throw new Error(json.error || "Import failed");

      if (json.status === "completed" || json.status === "completed_with_errors") {
        setResult({
          status: json.status,
          totalRows: json.totalRows ?? 0,
          importedCount: json.importedCount ?? 0,
          createdCount: json.createdCount ?? 0,
          updatedCount: json.updatedCount ?? 0,
          rowErrors: json.rowErrors ?? [],
        });
        router.refresh();
      } else {
        toast.success(`Import queued (${json.jobId?.slice(0, 8) ?? "job"})…`);
        close();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const step: "pick" | "map" | "result" = result ? "result" : headers.length > 0 ? "map" : "pick";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Import leads from CSV or Excel"
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-crm-border bg-white px-3 text-sm font-medium text-crm-fg transition-colors hover:border-accent-400 hover:bg-accent-50 hover:text-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-400"
      >
        <Upload size={16} />
        <span>Import CSV</span>
      </button>

      <Modal
        open={open}
        onClose={close}
        title={step === "map" ? "Map columns to fields" : "Import leads from CSV / Excel"}
        width={step === "map" ? "max-w-3xl" : "max-w-lg"}
      >
        {step === "result" && result ? (
          <ImportResultPanel result={result} onImportAnother={resetAll} onDone={close} />
        ) : step === "map" ? (
          <div className="space-y-4">
            <p className="text-sm text-crm-muted">
              <span className="font-medium text-crm-text">{fileName}</span> — choose which column
              feeds each Lead field. We&apos;ve auto-matched {mappedCount} by name; adjust any below.
              Unmapped fields are skipped.
            </p>

            {/* Mapping grid: field → column */}
            <div className="max-h-72 overflow-auto rounded-md border border-crm-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs text-crm-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Lead field</th>
                    <th className="px-3 py-2 text-left font-medium">CSV column</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => (
                    <tr key={f.key} className="border-t border-crm-border">
                      <td className="px-3 py-1.5">
                        <span className="font-medium text-crm-text">{f.label}</span>
                        {f.required && <span className="ml-0.5 text-red-500">*</span>}
                        {f.custom && (
                          <span className="ml-2 rounded bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-700">
                            custom
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={mapping[f.key] ?? ""}
                          onChange={(e) =>
                            setMapping((m) => ({ ...m, [f.key]: e.target.value }))
                          }
                          className="w-full max-w-[18rem] rounded-md border border-crm-border bg-white px-2 py-1 text-sm focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
                        >
                          <option value="">— Skip —</option>
                          {headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Data preview */}
            <div>
              <p className="mb-1 text-xs font-medium text-crm-muted">Preview (first {preview.length} rows)</p>
              <div className="max-h-40 overflow-auto rounded-md border border-crm-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-crm-muted">
                    <tr>
                      {headers.map((h) => (
                        <th key={h} className="whitespace-nowrap px-2 py-1 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-t border-crm-border">
                        {headers.map((h) => (
                          <td key={h} className="whitespace-nowrap px-2 py-1">{row[h] ?? ""}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {!nameMapped && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Map a column to <span className="font-medium">Name</span> (the only required field) to import.
              </p>
            )}

            <div className="flex justify-between gap-2">
              <Button variant="secondary" onClick={resetAll} disabled={busy}>
                Choose another file
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={close} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={doImport} disabled={!nameMapped || busy}>
                  {busy ? "Importing…" : "Import data"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-crm-muted">
              Upload a CSV or Excel (.xlsx/.xls) file. You&apos;ll map its columns to your Lead
              fields on the next step.
            </p>
            <div className="rounded-md border border-crm-border bg-gray-50 px-3 py-2 text-xs text-crm-muted">
              <p className="font-medium text-crm-text">How it works</p>
              <p className="mt-1">
                Pick a file → match each column to a Lead field (standard <em>or</em> custom) →
                import. Only <span className="font-medium text-crm-text">Name</span> is required.
              </p>
              <p className="mt-1">
                Re-importing updates existing leads (matched by email / phone / externalId) instead
                of creating duplicates.
              </p>
            </div>

            <LeadsImportSampleDownload />

            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-crm-border bg-gray-50 px-4 py-8 text-sm text-crm-muted hover:bg-gray-100">
              <Upload size={18} />
              {busy ? "Reading file…" : "Click to choose a CSV or Excel file"}
              <input
                type="file"
                className="hidden"
                disabled={busy}
                accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={(e) => onFileChosen(e.target.files?.[0] ?? null)}
              />
            </label>

            <div className="flex justify-end">
              <Button variant="secondary" onClick={close} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function ImportResultPanel({
  result,
  onImportAnother,
  onDone,
}: {
  result: ImportResult;
  onImportAnother: () => void;
  onDone: () => void;
}) {
  const failed = result.rowErrors.length;
  const tone =
    result.importedCount === 0 && failed > 0
      ? "border-red-200 bg-red-50 text-red-800"
      : failed > 0
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <div className="space-y-4">
      <div className={`rounded-md border px-3 py-3 text-sm ${tone}`}>
        <p className="font-medium">
          {result.importedCount === 0 && failed > 0
            ? "No rows were imported."
            : `Processed ${result.totalRows} row${result.totalRows === 1 ? "" : "s"}.`}
        </p>
        <ul className="mt-1.5 space-y-0.5">
          <li><span className="font-semibold tabular-nums">{result.createdCount}</span> new lead{result.createdCount === 1 ? "" : "s"} created</li>
          <li><span className="font-semibold tabular-nums">{result.updatedCount}</span> existing lead{result.updatedCount === 1 ? "" : "s"} updated (matched by email / phone / externalId)</li>
          {failed > 0 && (
            <li><span className="font-semibold tabular-nums">{failed}</span> row{failed === 1 ? "" : "s"} skipped due to errors</li>
          )}
        </ul>
      </div>

      {failed > 0 && (
        <div className="max-h-48 overflow-auto rounded-md border border-crm-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 text-crm-muted">
              <tr>
                <th className="px-2 py-1 text-left font-medium">Row</th>
                <th className="px-2 py-1 text-left font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {result.rowErrors.slice(0, 100).map((e) => (
                <tr key={e.row} className="border-t border-crm-border">
                  <td className="px-2 py-1 align-top tabular-nums text-crm-muted">{e.row}</td>
                  <td className="px-2 py-1">{e.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {failed > 100 && (
            <p className="px-2 py-1 text-xs text-crm-muted">…and {failed - 100} more.</p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onImportAnother}>
          Import another
        </Button>
        <Button onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}
