import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { getTenantContext } from "@/lib/auth/context";
import { ok, err } from "@/lib/http/envelope";
import { logger } from "@/lib/observability/logger";
import { boqService, type ImportMode, type RawSheet } from "@/lib/boq";

const auth = withOrgAuthForResource("construction.boq");

/**
 * POST /api/projects/:projectId/boq/preview-upload
 *
 * Stage 1 of the BOQ Upload Revision flow — Dual Import Engine version.
 *
 *   1. Client uploads .xlsx via multipart form-data (optional `mode` field:
 *      "AUTO" | "STRICT_TEMPLATE" | "GENERIC_SOR")
 *   2. Server parses with SheetJS, runs the Dual Import pipeline (detect →
 *      adapter → hierarchy → validate)
 *   3. Returns a stable PipelineResult that includes:
 *        - detectedMode + selected mode + supportedModes
 *        - per-sheet detection breakdown
 *        - parsed/skipped sheet counts
 *        - errors[] (blocking) + warnings[] (advisory)
 *        - sampleRows (first 10 leaves) for live preview
 *        - rows[] (full normalised set, returned so confirm doesn't re-upload)
 *
 * The full row set is returned to keep the confirm step snappy. Client
 * either POSTs the rows back to /import or cancels.
 */
export const POST = auth.importOrEdit<{ projectId: string }>(async (
  _authCtx,
  req: NextRequest,
  { params },
) => {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Read multipart body ────────────────────────────────────────
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
  if (file.size === 0) {
    return err("EMPTY_FILE", "File is empty", 400);
  }
  if (file.size > 50 * 1024 * 1024) {
    return err("FILE_TOO_LARGE", "File exceeds 50 MB limit for BOQ uploads", 413);
  }

  const modeField = (formData.get("mode") ?? "AUTO").toString().toUpperCase();
  const selectedMode: ImportMode | "AUTO" =
    modeField === "STRICT_TEMPLATE" ||
    modeField === "GENERIC_SOR" ||
    modeField === "ALPHABETIC_SOR" ||
    modeField === "UNIVERSAL"
      ? (modeField as ImportMode)
      : "AUTO";

  // Universal mode expects a JSON-stringified mapping in the `universalMapping`
  // form field: { bySheet: { [sheetName]: { headerRowIndex, colMap } } }
  let universalMapping: any = undefined;
  if (selectedMode === "UNIVERSAL") {
    const raw = formData.get("universalMapping");
    if (typeof raw !== "string" || !raw.trim()) {
      return err(
        "UNIVERSAL_MAPPING_REQUIRED",
        "Universal import requires a 'universalMapping' field (JSON). " +
        "Call /detect-columns first, collect the mapping from the user, then POST here.",
        400,
      );
    }
    try {
      universalMapping = JSON.parse(raw);
    } catch {
      return err("UNIVERSAL_MAPPING_INVALID", "universalMapping is not valid JSON", 400);
    }
  }

  // ── Parse with SheetJS ─────────────────────────────────────────
  let workbook: XLSX.WorkBook;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } catch (e: any) {
    logger.error({ msg: "boq_upload_parse_failed", err: e, fileName: file.name });
    return err(
      "PARSE_FAILED",
      "Could not parse the Excel file. Make sure it's a valid .xlsx workbook.",
      400
    );
  }

  // Convert to RawSheet[] — adapters handle header detection themselves.
  const rawSheets: RawSheet[] = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      blankrows: false,
    });
    return { sheetName, rows };
  });

  if (rawSheets.length === 0) {
    return err("NO_SHEETS", "Workbook contains no sheets", 400);
  }

  // ── Run pipeline (dry-run, no DB writes) ───────────────────────
  let pipeline;
  try {
    pipeline = await boqService.previewDualImport(
      ctx,
      params.projectId,
      rawSheets,
      selectedMode,
      universalMapping,
    );
  } catch (e: any) {
    if (e?.code === "BOQ_LOCKED") {
      return err("BOQ_LOCKED", e.message, 403);
    }
    logger.error({ msg: "boq_preview_pipeline_failed", err: e, fileName: file.name });
    return err("PIPELINE_FAILED", e?.message ?? "Pipeline failed", 500);
  }

  logger.info({
    msg: "boq_upload_previewed",
    projectId: params.projectId,
    fileName: file.name,
    detectedMode: pipeline.detectedMode,
    selectedMode: pipeline.mode,
    sheetCount: rawSheets.length,
    rowCount: pipeline.summary.totalRows,
    errorCount: pipeline.errors.length,
    warningCount: pipeline.warnings.length,
    userId: ctx.userId,
  });

  return ok({
    fileName: file.name,
    fileSize: file.size,
    selectedMode: pipeline.mode,
    detectedMode: pipeline.detectedMode,
    supportedModes: pipeline.supportedModes,
    detection: pipeline.detection,
    summary: pipeline.summary,
    errors: pipeline.errors,
    warnings: pipeline.warnings,
    sampleRows: pipeline.sampleRows,
    rows: pipeline.rows, // full set, used by /import on confirm
    nextStep: {
      endpoint: `/api/projects/${params.projectId}/boq/import`,
      method: "POST",
      bodyShape: {
        mode: "STRICT_TEMPLATE | GENERIC_SOR | AUTO",
        rows: "Array<NormalizedBoqRow>",
        replaceExisting: "boolean",
        fileName: "string",
      },
    },
  });
});
