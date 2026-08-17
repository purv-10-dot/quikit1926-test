"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { parseCsv, gridToRows, type RawRow } from "@/lib/test/importParse";
import { IMPORT_COLUMNS } from "@/lib/test/importMap";

/**
 * File chooser for the importer, with drag-and-drop.
 *
 * `.xlsx` is read with the `xlsx` package, which six sibling apps in this monorepo
 * already depend on at the same version — so this is an established dependency, not a
 * new one. It is imported DYNAMICALLY so the ~400KB parser is only fetched when
 * someone actually picks a spreadsheet, rather than loading on every Tests page view.
 */

const MAX_BYTES = 5 * 1024 * 1024;

export function ImportDropzone({
  onParsed,
  onError,
  onDownloadSample,
}: {
  onParsed: (
    fileName: string,
    parsed: { headers: string[]; rows: RawRow[] },
  ) => void;
  onError: (message: string) => void;
  onDownloadSample: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);

  const handleFile = async (file: File) => {
    onError("");

    if (file.size > MAX_BYTES) {
      onError(
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB — split it into smaller batches.`,
      );
      return;
    }

    const lower = file.name.toLowerCase();
    const isCsv = lower.endsWith(".csv") || lower.endsWith(".txt");
    const isExcel = lower.endsWith(".xlsx") || lower.endsWith(".xlsm");

    if (lower.endsWith(".xls")) {
      onError(
        "That is the old .xls format. Open it in Excel and save as .xlsx or .csv, then upload that.",
      );
      return;
    }
    if (!isCsv && !isExcel) {
      onError("Choose a .csv or .xlsx file.");
      return;
    }

    setReading(true);
    try {
      if (isCsv) {
        onParsed(file.name, parseCsv(await file.text()));
        return;
      }

      // Dynamic import: keeps the parser out of the initial bundle.
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) {
        onError("That workbook has no sheets.");
        return;
      }

      // header:1 gives a raw CELL GRID, which then goes through the same
      // grid→rows path as CSV — so both formats share one set of rules rather than
      // drifting apart. `raw: false` renders dates/numbers as the displayed text,
      // which is what a human typed and what the validators expect.
      const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
        header: 1,
        blankrows: false,
        defval: "",
        raw: false,
      });
      const asStrings = grid.map((r) => r.map((c) => String(c ?? "")));
      onParsed(file.name, gridToRows(asStrings));
    } catch {
      onError("Could not read that file. If it is a spreadsheet, try saving it as CSV.");
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        className={`rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-accent-500 bg-accent-50" : "border-gray-300 bg-gray-50"
        }`}
      >
        <FileSpreadsheet className="mx-auto h-8 w-8 text-gray-400" />
        <p className="mt-3 text-sm font-medium text-gray-800">
          {reading ? "Reading file…" : "Drop a CSV or Excel file here"}
        </p>
        <p className="mt-1 text-xs text-gray-500">.csv or .xlsx, up to 5 MB</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={reading}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          Choose a file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xlsm"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            // Clear, so re-picking the SAME file after a failure fires onChange again.
            e.target.value = "";
          }}
        />
      </div>

      <div className="rounded-lg border border-gray-200 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800">
              Not sure about the format?
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Download the sample, replace the three example rows, and upload it back.
              Only <strong className="font-medium text-gray-700">Title</strong> is
              required — every other column is optional.
            </p>
          </div>
          <button
            type="button"
            onClick={onDownloadSample}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-3.5 w-3.5" />
            Sample CSV
          </button>
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-accent-700 hover:underline">
            Columns the importer understands
          </summary>
          <ul className="mt-2 space-y-1">
            {Object.entries(IMPORT_COLUMNS).map(([key, aliases]) => (
              <li key={key} className="text-[11px] text-gray-600">
                <code className="rounded bg-gray-100 px-1 py-0.5">{aliases[0]}</code>
                {aliases.length > 1 && (
                  <span className="ml-1.5 text-gray-400">
                    also accepts: {aliases.slice(1).join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
            Put each step on its own line in the Steps cell. Add{" "}
            <code className="rounded bg-gray-100 px-1">=&gt;</code> to give one step
            its own expected result. Use{" "}
            <code className="rounded bg-gray-100 px-1">Login / Errors</code> in
            Section to nest folders — missing folders are created for you.
          </p>
        </details>
      </div>
    </div>
  );
}
