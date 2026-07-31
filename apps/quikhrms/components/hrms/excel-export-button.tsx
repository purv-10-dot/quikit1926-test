"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { clsx } from "clsx";
import { exportToExcel, type ExcelColumn } from "@/lib/utils/excel-export";

/**
 * Reusable "Export to Excel" button for list/table screens. Pass the columns and
 * the currently displayed (filtered) rows — it downloads a styled .xlsx.
 */
export function ExcelExportButton<T extends Record<string, unknown>>({
  filename,
  sheetName,
  columns,
  rows,
  getRows,
  disabled,
  className,
  label = "Export",
}: {
  filename: string;
  sheetName?: string;
  columns: ExcelColumn[];
  rows: T[];
  /** Optional async provider — fetches the FULL dataset (all pages) at click
   *  time. When given, the export uses these rows instead of the `rows` prop. */
  getRows?: () => Promise<T[]>;
  disabled?: boolean;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  // With an async provider we can't know emptiness up front, so don't pre-disable.
  const empty = !getRows && rows.length === 0;

  return (
    <button
      type="button"
      disabled={disabled || busy || empty}
      onClick={async () => {
        setBusy(true);
        try {
          const data = getRows ? await getRows() : rows;
          if (data.length === 0) return;
          await exportToExcel({ filename, sheetName, columns, rows: data });
        } finally {
          setBusy(false);
        }
      }}
      title={empty ? "Nothing to export" : "Export to Excel"}
      className={clsx(
        className ??
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-300 text-green-700 text-xs font-medium hover:bg-green-50 transition disabled:opacity-50",
      )}
    >
      <Download size={14} /> {busy ? "Exporting…" : label}
    </button>
  );
}
