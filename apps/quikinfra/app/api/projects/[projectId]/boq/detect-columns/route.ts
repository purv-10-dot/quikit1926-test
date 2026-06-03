import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getTenantContext } from "@/lib/auth/context";
import { ok, err } from "@/lib/http/envelope";
import { logger } from "@/lib/observability/logger";
import { detectColumnsForSheet } from "@/lib/boq/import/universal-adapter";
import type { DetectedSheetColumns } from "@/lib/boq/import/universal-adapter";

const auth = withOrgAuthForResource("construction.boq");

/**
 * POST /api/projects/:projectId/boq/detect-columns
 *
 * Stage 0 of the Universal Import flow: the user uploads their BOQ file, we
 * sniff the header row (keyword-score scan of the first 30 rows) and return
 * the raw column names + up to 3 sample values per column + a heuristic
 * suggestion for the standard field each column maps to.
 *
 * The drawer UI then shows a mapping screen where the user reviews/overrides
 * the suggestions. When the user clicks "Confirm Mapping", the drawer posts
 * the finalised mapping back to /preview-upload with mode=UNIVERSAL.
 *
 * No rows are parsed here — this is purely a metadata sniff, so it's cheap
 * and safe to call multiple times as the user clicks around.
 */
export const POST = auth.importOrEdit<{ projectId: string }>(async (
  _authCtx,
  req: NextRequest,
  { params },
) => {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return err("INVALID_BODY", "Expected multipart/form-data with a 'file' field", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return err("FILE_REQUIRED", "Upload a .xlsx file in the 'file' field", 400);
  }
  if (file.size === 0) return err("EMPTY_FILE", "File is empty", 400);
  if (file.size > 50 * 1024 * 1024) {
    return err("FILE_TOO_LARGE", "File exceeds 50 MB limit", 413);
  }

  let workbook: XLSX.WorkBook;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } catch (e: any) {
    logger.error({ msg: "boq_detect_columns_parse_failed", err: e, fileName: file.name });
    return err(
      "PARSE_FAILED",
      "Could not parse the Excel file. Make sure it's a valid .xlsx workbook.",
      400,
    );
  }

  const sheets: DetectedSheetColumns[] = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      blankrows: false,
    });
    return detectColumnsForSheet({ sheetName, rows });
  });

  logger.info({
    msg: "boq_columns_detected",
    projectId: params.projectId,
    fileName: file.name,
    userId: ctx.userId,
    sheetCount: sheets.length,
    withHeaders: sheets.filter((s) => s.headerRowIndex >= 0).length,
  });

  return ok({
    fileName: file.name,
    fileSize: file.size,
    sheets,
  });
});
