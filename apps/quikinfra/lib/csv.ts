/**
 * Client-side CSV export helper. Zero-dep, no streaming — fine for
 * internal-tool scale (up to ~50k rows).
 */

export interface CsvColumn<T> {
  header: string;
  get: (row: T) => string | number | null | undefined;
}

export function downloadCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]): void {
  const esc = (v: string | number | null | undefined) => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines: string[] = [];
  lines.push(columns.map(c => esc(c.header)).join(","));
  for (const row of rows) {
    lines.push(columns.map(c => esc(c.get(row))).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
