/**
 * Streaming CSV writer.
 *
 * Streams rows to the client via a ReadableStream so a 50 000-row export
 * never sits in memory. Three guarantees:
 *
 *   1. **UTF-8 BOM** as the first 3 bytes — without it Excel mis-renders
 *      Hindi / accented characters in CSV imports.
 *   2. **RFC 4180 escaping** — any value containing `,` `"` `\n` or `\r`
 *      is wrapped in `"…"` and internal `"` is doubled.
 *   3. **Row cap** = `REPORTS_CSV_MAX_ROWS` (default 50 000). When the cap
 *      is hit the stream stops silently — the upstream Prisma cursor does
 *      not page further.
 */
import { NextResponse } from "next/server";

export type CsvColumn<T> = {
  key: string;
  label: string;
  format?: (row: T) => string | number | boolean | Date | null | undefined;
};

const BOM = "﻿";

function defaultMaxRows(): number {
  const raw = process.env.REPORTS_CSV_MAX_ROWS;
  if (!raw) return 50_000;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 50_000;
}

export function escapeCsvCell(
  value: string | number | boolean | Date | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) {
    s = value.toISOString();
  } else if (typeof value === "number" || typeof value === "boolean") {
    s = String(value);
  } else {
    s = value;
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildRow<T>(row: T, columns: CsvColumn<T>[]): string {
  return columns
    .map((c) =>
      escapeCsvCell(c.format ? c.format(row) : (row as Record<string, unknown>)[c.key] as never),
    )
    .join(",");
}

export function streamCsv<T>(
  rows: AsyncIterable<T>,
  columns: CsvColumn<T>[],
  filename: string,
  opts?: { maxRows?: number },
): NextResponse {
  const maxRows = opts?.maxRows ?? defaultMaxRows();
  const encoder = new TextEncoder();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const header = columns.map((c) => escapeCsvCell(c.label)).join(",");
        controller.enqueue(encoder.encode(BOM + header + "\r\n"));

        let count = 0;
        for await (const row of rows) {
          if (count >= maxRows) break;
          controller.enqueue(encoder.encode(buildRow(row, columns) + "\r\n"));
          count += 1;
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeName}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
