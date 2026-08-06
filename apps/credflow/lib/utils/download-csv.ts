const CSV_MIME = "text/csv;charset=utf-8;";

/** Trigger a browser download with an explicit filename and CSV MIME type. */
export function downloadCsvFile(content: string, filename: string): void {
  const name = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  const blob = new Blob([content], { type: CSV_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
