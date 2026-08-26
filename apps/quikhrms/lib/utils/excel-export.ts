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

/** One chart, already rasterized to a PNG data URL (see lib/utils/canvas-chart.ts) — embedded as a static picture, since neither exceljs nor this repo's xlsx package can write a real, data-linked Excel chart object. */
export interface ExcelChartImage {
  title: string;
  /** `data:image/png;base64,...` */
  dataUrl: string;
  width: number;
  height: number;
}

export interface ExcelSheetSpec<T extends Record<string, unknown>> {
  name: string;
  columns: ExcelColumn[];
  rows: T[];
}

/**
 * Multi-sheet export for a single-recruiter date-range report: a "Summary"
 * sheet (key metrics + chart pictures) plus one sheet per detail list
 * (interviews / offers / hires). Kept separate from `exportToExcel` above —
 * that one is the simple flat-table export used by every list page and
 * shouldn't grow report-specific branching.
 */
export async function exportRecruiterReportToExcel(opts: {
  filename: string;
  recruiterName: string;
  range: { from: string; to: string };
  summary: { label: string; value: string }[];
  sheets: ExcelSheetSpec<Record<string, unknown>>[];
  charts?: ExcelChartImage[];
}): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();

  const summarySheet = wb.addWorksheet("Summary");
  summarySheet.getColumn(1).width = 30;
  summarySheet.getColumn(2).width = 24;
  summarySheet.mergeCells("A1:B1");
  const titleCell = summarySheet.getCell("A1");
  titleCell.value = `Recruiter Report — ${opts.recruiterName}`;
  titleCell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
  titleCell.alignment = { vertical: "middle" };
  summarySheet.getRow(1).height = 26;

  summarySheet.getCell("A2").value = "Date range";
  summarySheet.getCell("A2").font = { bold: true };
  summarySheet.getCell("B2").value = `${opts.range.from} to ${opts.range.to}`;

  let row = 4;
  for (const s of opts.summary) {
    summarySheet.getCell(`A${row}`).value = s.label;
    summarySheet.getCell(`A${row}`).font = { bold: true };
    summarySheet.getCell(`B${row}`).value = s.value;
    row++;
  }

  if (opts.charts?.length) {
    row += 1;
    for (const chart of opts.charts) {
      summarySheet.getCell(`A${row}`).value = chart.title;
      summarySheet.getCell(`A${row}`).font = { bold: true };
      row += 1;
      const base64 = chart.dataUrl.split(",")[1] ?? "";
      const imageId = wb.addImage({ base64, extension: "png" });
      // ExcelJS image anchors are 0-indexed (row 0 = spreadsheet row 1) — `row` above is 1-indexed (matches getCell), so it needs the -1 here.
      summarySheet.addImage(imageId, { tl: { col: 0, row: row - 1 }, ext: { width: chart.width, height: chart.height } });
      row += Math.ceil(chart.height / 20) + 2; // ~20px per row — leave room under the picture
    }
  }

  for (const sheet of opts.sheets) {
    const ws = wb.addWorksheet(sheet.name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = sheet.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 18 }));
    for (const r of sheet.rows) ws.addRow(r);
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16A34A" } };
    header.height = 20;
    if (sheet.columns.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename.endsWith(".xlsx") ? opts.filename : `${opts.filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
