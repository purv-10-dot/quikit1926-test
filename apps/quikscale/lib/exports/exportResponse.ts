/**
 * Wrap a generated workbook buffer in a downloadable NextResponse. Exports are
 * Excel (.xlsx) only.
 */
import { NextResponse } from "next/server";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * @param body       The generated .xlsx bytes (ArrayBuffer — NextResponse
 *                   accepts it directly as BodyInit).
 * @param baseName   Filename WITHOUT extension. The date suffix + `.xlsx` are
 *                   appended here so every module shares one naming convention.
 * @param dateSuffix "YYYY-MM-DD" appended before the extension.
 */
export function fileResponse(body: ArrayBuffer, baseName: string, dateSuffix: string): NextResponse {
  const safe = baseName.replace(/[^A-Za-z0-9._-]+/g, "_");
  const filename = `${safe}-${dateSuffix}.xlsx`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
      // Exports are per-request and user-scoped — never cache.
      "Cache-Control": "no-store",
    },
  });
}
