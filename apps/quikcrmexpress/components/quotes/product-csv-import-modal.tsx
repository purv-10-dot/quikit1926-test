"use client";

/**
 * CSV / XLSX import for products.
 *
 * Why client-side parse:
 *   - `xlsx` (a workspace dep already) reads both CSV + XLSX in the
 *     browser. We send already-parsed rows to the server as JSON, which
 *     keeps the API stateless and avoids multipart/form-data handling.
 *   - User sees parse errors immediately (before submit) rather than
 *     waiting on a server round-trip just to find out the file is junk.
 *
 * Column mapping: the parser uses the first row as headers (case-
 * insensitive, trimmed). Required columns: `name`, `sku`, `listPrice`,
 * `gstRate`. Optional: `category`, `hsnCode`, `unitGroup`, `defaultUnit`,
 * `productType`, `isActive`. Same shape as the create-product API.
 *
 * Server-side enforces the schema (Zod) — junk fields are silently
 * ignored, missing required fields land in the per-row errors list.
 */

import { useState } from "react";
import { Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface ImportResult {
  attempted: number;
  created: number;
  skippedDuplicates: number;
  errors: Array<{ row: number; error: string }>;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function ProductCsvImportModal({ open, onClose, onImported }: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setRows(null);
    setFileName("");
    setResult(null);
    setError(null);
    setSubmitting(false);
  }

  async function handleFile(file: File) {
    reset();
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]!]!;
      // header:1 → returns array-of-arrays; we then build records using
      // the first row as header keys (lowercased + trimmed for safety —
      // tolerates "Name", " name ", "name" all the same).
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      if (raw.length < 2) {
        throw new Error("File needs at least a header row + 1 data row.");
      }
      const headers = (raw[0] as string[]).map((h) =>
        String(h ?? "").trim().replace(/^./u, (c) => c.toLowerCase()),
      );
      const parsed = raw.slice(1).map((arr) => {
        const r: Record<string, unknown> = {};
        const row = arr as unknown[];
        headers.forEach((h, i) => {
          if (!h) return;
          let val: unknown = row[i];
          if (val === "" || val == null) {
            val = undefined;
          } else if (h === "listPrice" || h === "gstRate" || h === "standardCost") {
            val = Number(val);
          } else if (h === "isActive") {
            const s = String(val).toLowerCase();
            val = s === "true" || s === "1" || s === "yes" || s === "y";
          }
          if (val !== undefined) r[h] = val;
        });
        return r;
      });
      setRows(parsed);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to parse file");
    }
  }

  async function handleSubmit() {
    if (!rows) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Import failed");
      setResult(body.data);
      // Even if some rows errored, trigger the parent reload so the
      // successful ones show up. Errors are still visible in the modal.
      if (body.data.created > 0) onImported();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to import products");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!submitting) {
          reset();
          onClose();
        }
      }}
      title="Import products from CSV / XLSX"
      width="max-w-2xl"
    >
      <div className="space-y-3">
        <p className="text-sm text-crm-muted">
          Upload a CSV or Excel file with these columns (first row = headers):
        </p>
        <pre className="rounded border border-crm-border bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-crm-text">
{`name,sku,listPrice,gstRate,category,hsnCode,unitGroup,defaultUnit,productType,isActive
Dell Laptop,DELL-LAP-001,50000,18,Electronics,8471,Each,Each,Product,true
Senior Developer,DEV-SR,800,18,Engineering,998313,Day,Day,Service,true`}
        </pre>
        <p className="text-xs text-crm-muted">
          Required: <code>name</code>, <code>sku</code>, <code>listPrice</code>,{" "}
          <code>gstRate</code>. Duplicate SKUs are silently skipped (idempotent —
          safe to re-run the same file).
        </p>

        {!rows && !result && (
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-crm-border bg-gray-50 px-4 py-8 text-sm text-crm-muted hover:bg-gray-100">
            <Upload size={18} />
            Click to choose a CSV / XLSX file
            <input
              type="file"
              className="hidden"
              accept=".csv,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </label>
        )}

        {rows && !result && (
          <div className="rounded border border-crm-border bg-white px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-crm-text">{fileName}</span>
              <button
                type="button"
                onClick={reset}
                className="text-xs text-crm-muted hover:text-crm-text"
              >
                Choose a different file
              </button>
            </div>
            <p className="mt-1 text-xs text-crm-muted">
              Parsed {rows.length} row{rows.length === 1 ? "" : "s"}. Click{" "}
              <span className="font-medium">Import</span> to send them to the server.
            </p>
          </div>
        )}

        {result && (
          <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            <p className="font-medium">Import finished.</p>
            <ul className="mt-1 ml-4 list-disc text-xs text-blue-700">
              <li>{result.attempted} rows processed</li>
              <li>
                <strong>{result.created}</strong> created
              </li>
              <li>{result.skippedDuplicates} skipped (duplicate SKU)</li>
              {result.errors.length > 0 && (
                <li className="text-red-700">
                  <strong>{result.errors.length}</strong> errored — see below
                </li>
              )}
            </ul>
            {result.errors.length > 0 && (
              <details className="mt-2 text-xs text-red-700">
                <summary className="cursor-pointer font-medium">Show row errors</summary>
                <ul className="mt-1 ml-4 list-disc">
                  {result.errors.slice(0, 50).map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.error}
                    </li>
                  ))}
                  {result.errors.length > 50 && (
                    <li>… and {result.errors.length - 50} more</li>
                  )}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        {result ? (
          <Button
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Close
          </Button>
        ) : (
          <>
            <Button onClick={handleSubmit} disabled={!rows || submitting || rows.length === 0}>
              {submitting ? "Importing…" : `Import ${rows?.length ?? 0} row${rows?.length === 1 ? "" : "s"}`}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                reset();
                onClose();
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
