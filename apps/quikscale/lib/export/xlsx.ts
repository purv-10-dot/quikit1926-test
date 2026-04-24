"use client";

/**
 * Client-side xlsx export helper.
 *
 * Accepts a list of column keys + row scope + fetch functions for each scope,
 * formats the chosen rows into a SheetJS workbook, and triggers a browser
 * download. No server roundtrip needed — `xlsx` works in-browser.
 */
import * as XLSX from "xlsx";
import type { ExportSelection } from "@quikit/ui";

export interface ExportColumnDef<Row> {
  key: string;
  label: string;
  /** Value extractor. Return string | number | null. */
  value: (row: Row) => string | number | null | undefined;
}

export interface ExportParams<Row> {
  selection: ExportSelection;
  columns: ExportColumnDef<Row>[];
  /** Rows the user sees on the current page. */
  pageRows: Row[];
  /** Returns all rows matching the current filters (across pages). */
  fetchFiltered: () => Promise<Row[]>;
  /** Returns all rows regardless of filters. */
  fetchAll: () => Promise<Row[]>;
  /** Filename (without extension). */
  filename: string;
  sheetName?: string;
}

export async function runExport<Row>({
  selection,
  columns,
  pageRows,
  fetchFiltered,
  fetchAll,
  filename,
  sheetName = "Sheet1",
}: ExportParams<Row>): Promise<void> {
  let rows: Row[];
  switch (selection.rowScope) {
    case "page":
      rows = pageRows;
      break;
    case "filtered":
      rows = await fetchFiltered();
      break;
    case "all":
      rows = await fetchAll();
      break;
  }

  const selectedCols = columns.filter((c) => selection.columnKeys.includes(c.key));
  if (selectedCols.length === 0) return;

  // Build 2D array: header + rows
  const header = selectedCols.map((c) => c.label);
  const body = rows.map((row) =>
    selectedCols.map((c) => {
      const v = c.value(row);
      if (v == null) return "";
      return v;
    }),
  );

  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  // Auto-width guess (cap at 40 chars)
  ws["!cols"] = selectedCols.map((_, i) => {
    const maxLen = Math.max(
      header[i].length,
      ...body.map((r) => String(r[i] ?? "").length),
    );
    return { wch: Math.min(40, Math.max(8, maxLen + 2)) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 30));

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filename}-${today}.xlsx`);
}
