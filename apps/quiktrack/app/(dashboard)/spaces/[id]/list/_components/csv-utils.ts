/**
 * Tiny CSV helpers — handles the minimum we need (quoted fields, escaped quotes,
 * embedded newlines, CRLF). Avoids pulling in a full CSV lib for the small
 * import/export surface area.
 */

const IMPORT_HEADERS = [
  "title",
  "type",
  "priority",
  "status",
  "assigneeEmail",
  "storyPoints",
  "eta",
  "dueDate",
  "description",
] as const;

export const TEMPLATE_HEADERS = IMPORT_HEADERS;

const TEMPLATE_EXAMPLE_ROW = [
  "Set up payment gateway",
  "TASK",
  "HIGH",
  "To Do",
  "alice@example.com",
  "5",
  "8",
  "2026-06-15",
  "Integrate Stripe + Razorpay",
];

export function buildTemplateCsv(): string {
  return toCsv([TEMPLATE_HEADERS as unknown as string[], TEMPLATE_EXAMPLE_ROW]);
}

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map(escapeCell).join(",")).join("\r\n");
}

/**
 * Parse a CSV string into rows. Handles quoted fields with commas, escaped
 * quotes (`""`), and CRLF / LF line endings. Empty trailing lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { row.push(cell); cell = ""; i++; continue; }
    if (ch === "\r") {
      // Treat \r\n and bare \r as a row terminator.
      row.push(cell); rows.push(row); row = []; cell = "";
      if (text[i + 1] === "\n") i += 2; else i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cell); rows.push(row); row = []; cell = "";
      i++; continue;
    }
    cell += ch; i++;
  }

  // Flush final cell/row.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Drop fully-empty trailing rows that come from stray newlines.
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  return rows;
}

export interface ParsedImport {
  headers: string[];
  rows: Record<string, string>[];
  /** Headers from the file that aren't in the template — surfaced as warnings. */
  unknownHeaders: string[];
  /** Headers from the template missing in the file — surfaced as warnings. */
  missingHeaders: string[];
}

export function parseImportCsv(text: string): ParsedImport {
  const all = parseCsv(text);
  if (all.length === 0) return { headers: [], rows: [], unknownHeaders: [], missingHeaders: [] };
  const headers = all[0].map((h) => h.trim());
  const known = new Set<string>(TEMPLATE_HEADERS);
  const unknownHeaders = headers.filter((h) => !known.has(h));
  const missingHeaders = TEMPLATE_HEADERS.filter((h) => !headers.includes(h) && h !== "description" && h !== "assigneeEmail" && h !== "storyPoints" && h !== "eta" && h !== "dueDate" && h !== "priority" && h !== "status");

  const rows = all.slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
      return obj;
    });

  return { headers, rows, unknownHeaders, missingHeaders };
}

export function downloadBlob(filename: string, content: string, mime = "text/csv") {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
