"use client";

import { Download } from "lucide-react";
import { downloadCsv, type CsvColumn } from "@/lib/csv";

interface Props<T> {
  filename: string;
  rows: T[];
  columns: CsvColumn<T>[];
  label?: string;
}

export function ExportButton<T>({ filename, rows, columns, label = "Export CSV" }: Props<T>) {
  return (
    <button
      onClick={() => downloadCsv(filename, rows, columns)}
      disabled={rows.length === 0}
      className="inline-flex items-center gap-1 text-xs border border-gray-300 bg-white text-gray-700 px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
      title={rows.length === 0 ? "Nothing to export" : `Export ${rows.length} rows`}
    >
      <Download className="h-3 w-3" /> {label}
    </button>
  );
}
