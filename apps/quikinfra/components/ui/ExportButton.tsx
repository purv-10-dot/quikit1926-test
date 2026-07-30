"use client";

/**
 * ExportButton — converts a list of rows into a CSV file and downloads it.
 *
 * Each column declares a header label and a `get(row)` accessor. Values are
 * stringified and CSV-escaped (quotes doubled, commas/newlines/quotes wrapped
 * in quotes). Empty/null/undefined accessors produce empty cells.
 */

import { Download } from "lucide-react";

export interface ExportColumn<T> {
  header: string;
  get: (row: T) => string | number | null | undefined;
}

interface Props<T> {
  filename: string;
  rows: T[];
  columns: ExportColumn<T>[];
  disabled?: boolean;
  label?: string;
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  // RFC 4180: a field that contains a comma, quote, CR, or LF must be wrapped
  // in double quotes; embedded quotes are doubled.
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function ExportButton<T>({ filename, rows, columns, disabled, label = "Export CSV" }: Props<T>) {
  const handle = () => {
    const lines: string[] = [];
    lines.push(columns.map((c) => csvEscape(c.header)).join(","));
    for (const row of rows) {
      lines.push(columns.map((c) => csvEscape(c.get(row))).join(","));
    }
    // Prepend a UTF-8 BOM so Excel renders non-ASCII characters (₹, ä, …)
    // correctly when opening the file.
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = filename.replace(/[^a-z0-9_.-]+/gi, "-");
    a.href = url;
    a.download = `${safe}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isEmpty = rows.length === 0;

  return (
    <button
      type="button"
      onClick={handle}
      disabled={disabled || isEmpty}
      title={isEmpty ? "Nothing to export" : `Download ${rows.length} rows as CSV`}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-accent-50 hover:border-accent-300 hover:text-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <Download className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
