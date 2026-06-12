/**
 * Custom CSV parser ported from quikcrm-backend/src/platform/import-worker-core.service.ts.
 * Handles BOM, quoted fields, escaped quotes, commas inside quoted strings.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const lines: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\r") {
        // skip
      } else if (ch === "\n") {
        row.push(cell);
        lines.push(row);
        row = [];
        cell = "";
      } else {
        cell += ch;
      }
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    lines.push(row);
  }
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0]!.map((h) => h.trim());
  const rows = lines.slice(1).filter((r) => r.length && r.some((c) => c.trim().length)).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = (r[i] ?? "").trim()));
    return obj;
  });
  return { headers, rows };
}
