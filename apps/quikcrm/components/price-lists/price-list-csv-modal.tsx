"use client";

import { useState } from "react";
import { Upload, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

interface ImportResult {
  upserted: number;
  errors: Array<{ row: number; error: string }>;
}

interface Props {
  open: boolean;
  priceListId: string;
  onClose: () => void;
  onImported: () => void;
}

export function PriceListCsvModal({ open, priceListId, onClose, onImported }: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState("");
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
      const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      if (raw.length < 2) throw new Error("File needs a header row + at least one data row.");
      const headers = (raw[0] as string[]).map((h) =>
        String(h ?? "")
          .trim()
          .replace(/^./u, (c) => c.toLowerCase()),
      );
      const parsed = raw.slice(1).map((arr) => {
        const r: Record<string, unknown> = {};
        const row = arr as unknown[];
        headers.forEach((h, i) => {
          if (!h) return;
          let val: unknown = row[i];
          if (val === "" || val == null) val = undefined;
          else if (["unitPrice", "discountPct", "minQuantity", "floorPrice", "catalogListPrice"].includes(h)) {
            val = Number(val);
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

  async function handleImport() {
    if (!rows?.length) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = rows.map((r) => ({
        sku: String(r.sku ?? ""),
        unitPrice: Number(r.unitPrice),
        discountPct: r.discountPct != null ? Number(r.discountPct) : undefined,
        minQuantity: r.minQuantity != null ? Number(r.minQuantity) : undefined,
        floorPrice: r.floorPrice != null ? Number(r.floorPrice) : undefined,
        notes: r.notes != null ? String(r.notes) : undefined,
      }));
      const res = await fetch(`/api/price-lists/${priceListId}/import`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows: payload }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error ?? "Import failed");
      setResult(j.data as ImportResult);
      if ((j.data as ImportResult).errors.length === 0) {
        onImported();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Import / export pricing" width="max-w-lg">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              window.location.href = `/api/price-lists/${priceListId}/export`;
            }}
          >
            <Download size={14} /> Export CSV
          </Button>
        </div>
        <p className="text-xs text-crm-muted">
          Required columns: <code className="rounded bg-gray-100 px-1">sku</code>,{" "}
          <code className="rounded bg-gray-100 px-1">unitPrice</code>. Optional: discountPct, minQuantity,
          floorPrice, notes.
        </p>
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-crm-border bg-crm-panel/40 px-4 py-8 text-sm text-crm-muted hover:bg-crm-panel">
          <Upload size={20} className="mb-2" />
          {fileName || "Choose CSV or XLSX"}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </label>
        {rows && (
          <p className="text-sm text-crm-text">
            Parsed <strong>{rows.length}</strong> row(s) from {fileName}.
          </p>
        )}
        {result && (
          <div className="rounded border border-crm-border bg-crm-panel p-3 text-sm">
            <p>
              Upserted <strong>{result.upserted}</strong> row(s).
              {result.errors.length > 0 && (
                <span className="text-amber-700"> {result.errors.length} error(s).</span>
              )}
            </p>
            {result.errors.slice(0, 5).map((e) => (
              <p key={e.row} className="text-xs text-red-600">
                Row {e.row}: {e.error}
              </p>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button onClick={handleImport} disabled={submitting || !rows?.length}>
          {submitting ? "Importing…" : "Import"}
        </Button>
        <Button variant="secondary" onClick={() => { reset(); onClose(); }} disabled={submitting}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
