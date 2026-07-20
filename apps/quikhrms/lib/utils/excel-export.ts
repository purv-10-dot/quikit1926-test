/**
 * Shared client-side Excel (.xlsx) export.
 *
 * Exports an array of flat row objects to a styled worksheet and triggers a
 * browser download. Used by the "Export" button on list/table screens so every
 * table exports with the same look (branded header, frozen header row, filters).
 *
 * Exports exactly the rows you pass in — typically the currently filtered/visible
 * set — so what the user sees is what they get.
 */
export interface ExcelColumn {
  /** Column heading shown in row 1. */
  header: string;
  /** Key into each row object. */
  key: string;
  /** Column width in characters (default 18). */
  width?: number;
}

export async function exportToExcel<T extends Record<string, unknown>>(opts: {
  filename: string;
  sheetName?: string;
  columns: ExcelColumn[];
  rows: T[];
}): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(opts.sheetName ?? "Sheet1", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = opts.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
  for (const r of opts.rows) ws.addRow(r);

  // Branded header row (green, matches the app accent) — bold white on solid fill.
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
  header.alignment = { vertical: "middle", horizontal: "left" };
  header.height = 20;

  if (opts.columns.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: opts.columns.length } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename.endsWith(".xlsx") ? opts.filename : `${opts.filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
