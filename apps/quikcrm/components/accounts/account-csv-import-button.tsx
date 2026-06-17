"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/hooks/use-toast";
import {
  ACCOUNTS_IMPORT_SAMPLE_CSV,
  ACCOUNTS_IMPORT_SAMPLE_FILENAME,
} from "@/lib/import/accounts-import-sample";
import { downloadCsvFile } from "@/lib/utils/download-csv";

export function AccountCsvImportButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setFile(null);
    setBusy(false);
  }

  function close() {
    if (busy) return;
    reset();
    setOpen(false);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/imports/queue/accounts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, csvText: text, sourceSystem: "ui-upload" }),
      });
      const json = (await res.json()) as {
        error?: string;
        jobId?: string;
        status?: string;
        importedCount?: number;
        totalRows?: number;
        rowErrors?: Array<{ row: number; error: string }>;
      };
      if (!res.ok) throw new Error(json.error || "Upload failed");

      if (json.status === "completed" || json.status === "completed_with_errors") {
        const failed = json.rowErrors?.length ?? 0;
        const imported = json.importedCount ?? 0;
        if (imported === 0 && failed > 0) {
          toast.error(`Import failed — ${failed} row(s) had errors.`);
        } else if (failed > 0) {
          toast.info(`Imported ${imported} of ${json.totalRows ?? 0} rows (${failed} failed).`);
        } else {
          toast.success(`Imported ${imported} account(s).`);
        }
        router.refresh();
      } else {
        toast.success(`Import queued (${json.jobId?.slice(0, 8) ?? "job"})…`);
      }
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Import accounts from CSV"
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-crm-border bg-white px-3 text-sm font-medium text-crm-fg transition-colors hover:border-accent-400 hover:bg-accent-50 hover:text-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-400"
      >
        <Upload size={16} />
        <span>Import CSV</span>
      </button>

      <Modal open={open} onClose={close} title="Import accounts from CSV" width="max-w-lg">
        <div className="space-y-4">
          <p className="text-sm text-crm-muted">
            Upload a CSV file to bulk-create or update accounts. Existing accounts with the same
            name are updated; new names create new records.
          </p>
          <div className="rounded-md border border-crm-border bg-gray-50 px-3 py-2 text-xs text-crm-muted">
            <p className="font-medium text-crm-text">CSV columns (row 1 = headers)</p>
            <p className="mt-1">
              <span className="font-medium text-crm-text">Required:</span> name — all other
              columns are optional.
            </p>
            <p className="mt-1">
              name, ownerName, industry, website, city, state, countryCode, postalCode, status,
              segment, annualRevenueDisplay, annualRevenueCurrency, contractStart, contractEnd,
              renewalDate, npsScore
            </p>
          </div>

          <button
            type="button"
            onClick={() => downloadCsvFile(ACCOUNTS_IMPORT_SAMPLE_CSV, ACCOUNTS_IMPORT_SAMPLE_FILENAME)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-700 hover:text-accent-800 hover:underline"
          >
            <Download size={16} aria-hidden />
            Download example CSV
          </button>

          {!file ? (
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-crm-border bg-gray-50 px-4 py-8 text-sm text-crm-muted hover:bg-gray-100">
              <Upload size={18} />
              Click to choose a CSV file
              <input
                type="file"
                className="hidden"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          ) : (
            <div className="rounded border border-crm-border bg-white px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-crm-text">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  disabled={busy}
                  className="shrink-0 text-xs text-crm-muted hover:text-crm-text disabled:opacity-50"
                >
                  Choose different file
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={upload} disabled={!file || busy}>
              {busy ? "Queueing…" : "Queue import"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
