/**
 * Spreadsheet parsing for the test-case importer.
 *
 * The CSV reader is hand-written rather than `line.split(",")` (the pattern used in
 * a sibling app's bulk import) because test-case content breaks that immediately:
 * titles and step text contain commas constantly, and steps contain NEWLINES. A
 * naive split silently shifts every column after the first comma, producing rows
 * that look plausible and are wrong — the worst possible outcome for an importer.
 *
 * Handles: quoted fields, escaped quotes (""), embedded commas, embedded newlines,
 * CRLF, and a UTF-8 BOM (Excel writes one, and it would otherwise corrupt the first
 * header name).
 */

/** One parsed row, keyed by its header. */
export type RawRow = Record<string, string>;

/**
 * RFC 4180-ish CSV → rows of cells. Returns raw cell grids, not objects, so the
 * caller can report "row 7" using the real file row number.
 */
export function parseCsvGrid(text: string): string[][] {
  // Strip a UTF-8 BOM. Excel adds one, and without this the first header becomes
  // "﻿Title" and never matches.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        // "" inside a quoted field is a literal quote.
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r") {
      // Swallow; the \n branch ends the row. Handles CRLF and lone CR.
      if (src[i + 1] !== "\n") {
        row.push(cell);
        cell = "";
        rows.push(row);
        row = [];
      }
    } else if (ch === "\n") {
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }

  // Trailing cell/row, unless the file ended on a clean newline.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Drop rows that are entirely empty — a trailing blank line is not a record.
  return rows.filter((r) => r.some((c) => c.trim().length > 0));
}

/**
 * Grid → objects keyed by header.
 *
 * Header matching is case- and space-insensitive so "Test Case Title", "title" and
 * "TITLE" all work; people rename columns and should not be punished for it.
 */
export function gridToRows(grid: string[][]): {
  headers: string[];
  rows: RawRow[];
} {
  if (grid.length === 0) return { headers: [], rows: [] };

  const headers = grid[0].map((h) => h.trim());
  const rows = grid.slice(1).map((cells) => {
    const obj: RawRow = {};
    headers.forEach((h, i) => {
      obj[normaliseHeader(h)] = (cells[i] ?? "").trim();
    });
    return obj;
  });

  return { headers, rows };
}

/** Lowercase, strip spaces/underscores/hyphens, so header spelling is forgiving. */
export function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_-]+/g, "");
}

export function parseCsv(text: string): { headers: string[]; rows: RawRow[] } {
  return gridToRows(parseCsvGrid(text));
}
