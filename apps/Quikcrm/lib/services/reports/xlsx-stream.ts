/**
 * Excel (.xlsx) writer for the report export pipeline.
 *
 * Uses SheetJS (`xlsx`, already a project dep). Unlike `csv-stream.ts` this
 * is buffer-based — `xlsx` builds the full workbook in memory before
 * writing, so we cap rows the same way (`REPORTS_CSV_MAX_ROWS`, also used
 * for xlsx) and only fully materialise rows that fit.
 *
 * Reuses the same `CsvColumn<T>` shape as the CSV exporter so each route
 * has a single column source-of-truth.
 */
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import type { CsvColumn } from "./csv-stream";

function defaultMaxRows(): number {
  const raw = process.env.REPORTS_CSV_MAX_ROWS;
  if (!raw) return 50_000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 50_000;
}

function cellValue<T>(row: T, column: CsvColumn<T>): unknown {
  const raw = column.format ? column.format(row) : (row as Record<string, unknown>)[column.key];
  if (raw === null || raw === undefined) return "";
  if (raw instanceof Date) return raw;
  return raw;
}

export async function streamXlsx<T>(
  rows: AsyncIterable<T>,
  columns: CsvColumn<T>[],
  filename: string,
  opts?: { maxRows?: number; sheetName?: string },
): Promise<NextResponse> {
  const maxRows = opts?.maxRows ?? defaultMaxRows();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const sheetName = (opts?.sheetName ?? "Report").slice(0, 31); // Excel max

  // Build the AOA (array of arrays) shape SheetJS expects.
  const aoa: unknown[][] = [];
  aoa.push(columns.map((c) => c.label));

  let count = 0;
  for await (const row of rows) {
    if (count >= maxRows) break;
    aoa.push(columns.map((c) => cellValue(row, c)));
    count += 1;
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Bold the header row by widening + freezing top row. SheetJS basic API
  // doesn't ship cell formatting in the open-source build, so we settle
  // for a freeze pane + auto-width estimate (sufficient for the use case).
  const colWidths = columns.map((c) => ({ wch: Math.min(40, Math.max(c.label.length + 2, 12)) }));
  (ws as unknown as { "!cols"?: unknown })["!cols"] = colWidths;
  (ws as unknown as { "!freeze"?: unknown })["!freeze"] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  // NextResponse's typed `BodyInit` (Next 14) doesn't accept Buffer/Uint8Array
  // directly. Copy the bytes into a fresh ArrayBuffer-backed Uint8Array so
  // the lib.dom.d.ts narrowing accepts it inside a Blob.
  const ab = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(ab).set(buffer);
  const blob = new Blob([ab], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}.xlsx"`,
      "Cache-Control": "no-store",
      "Content-Length": String(buffer.byteLength),
    },
  });
}
