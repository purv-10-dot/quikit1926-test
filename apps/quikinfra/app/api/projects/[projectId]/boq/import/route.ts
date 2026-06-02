import { NextRequest, NextResponse } from "next/server";
import {
  boqService,
  BOQError,
  type ExcelRow,
  type MultiSheetInput,
  type ImportMode,
  type NormalizedBoqRow,
  type RawSheet,
} from "@/lib/boq";
import { requirePermission, badRequest } from "@/lib/auth/context";
import { rateLimit, LIMITS } from "@/lib/workflow/rate-limit";
import { logger } from "@/lib/observability/logger";

/**
 * BOQ Import API — Dual Import Engine version
 *
 * POST /api/projects/:projectId/boq/import
 *
 * Requires `boq.import` permission.
 *
 * Accepts THREE input modes (in priority order):
 *
 * 1) `rows`:    pre-parsed NormalizedBoqRow[] from a /preview-upload round-trip.
 *               This is the modern path used by the BOQImportDrawer — the
 *               server re-validates and re-resolves hierarchy before persisting.
 *
 * 2) `sheets`:  raw [{sheetName, rows}] grids — server runs the dual import
 *               pipeline end-to-end. Used by clients that want to skip the
 *               preview step.
 *
 * 3) `items`:   legacy already-parsed bulk insert. Routed through the service
 *               layer so lock + tenant + audit are still enforced.
 *
 * Body params common to all modes:
 *   - mode:            "STRICT_TEMPLATE" | "GENERIC_SOR" | "AUTO" (default: AUTO)
 *   - replaceExisting: boolean — wipes the project's BOQ before insert
 *   - fileName:        string  — recorded on the import batch for audit
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  const ctxOrResponse = await requirePermission("boq.import", {
    matrix: { menuKey: "pm.boq", action: "add" },
  });
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;
  const ctx = ctxOrResponse;

  const limited = await rateLimit({ ...LIMITS.IMPORT_BOQ, req, identifier: ctx.userId });
  if (limited.blocked) {
    logger.warn({ msg: "rate_limited", route: "boq.import", userId: ctx.userId, orgId: ctx.orgId });
    return limited.response!;
  }

  try {
    const body = await req.json();
    const fileName = body.fileName ?? body.source ?? "Unknown.xlsx";
    const replaceExisting = body.replaceExisting === true;

    const rawMode = (body.mode ?? "AUTO").toString().toUpperCase();
    const selectedMode: ImportMode | "AUTO" =
      rawMode === "STRICT_TEMPLATE" ||
      rawMode === "GENERIC_SOR" ||
      rawMode === "ALPHABETIC_SOR" ||
      rawMode === "UNIVERSAL"
        ? (rawMode as ImportMode)
        : "AUTO";

    // ─── Mode A: Pre-parsed normalised rows (modern preview round-trip) ───
    if (body.rows && Array.isArray(body.rows)) {
      // ALPHABETIC_SOR is a cosmetic alias of GENERIC_SOR; flatten it to
      // keep the persisted importMode values in line with the downstream
      // schema enum that only knows STRICT_TEMPLATE / GENERIC_SOR.
      const persistMode: ImportMode =
        selectedMode === "AUTO" || selectedMode === "ALPHABETIC_SOR"
          ? "GENERIC_SOR"
          : selectedMode;

      const result = await boqService.persistDualImport(
        ctx,
        params.projectId,
        body.rows as NormalizedBoqRow[],
        fileName,
        replaceExisting,
        persistMode
      );

      if (result.errors.length > 0) {
        return NextResponse.json(
          {
            success: false,
            batchId: result.batchId,
            errors: result.errors,
            warnings: result.warnings,
            message:
              `Import rejected with ${result.errors.length} error(s). ` +
              `Fix the source file and re-upload.`,
          },
          { status: 422 }
        );
      }

      logger.info({
        msg: "boq_import_persisted",
        projectId: params.projectId,
        userId: ctx.userId,
        mode: persistMode,
        inserted: result.inserted.length,
        warnings: result.warnings.length,
      });

      return NextResponse.json(
        {
          success: true,
          batchId: result.batchId,
          imported: result.inserted.length,
          source: fileName,
          mode: persistMode,
          warnings: result.warnings,
          message: `${result.inserted.length} BOQ items imported from ${fileName}`,
        },
        { status: 201 }
      );
    }

    // ─── Mode B: Raw sheets (server runs the full pipeline) ───────────────
    if (body.sheets && Array.isArray(body.sheets)) {
      const rawSheets: RawSheet[] = body.sheets.map((s: any) => ({
        sheetName: s.sheetName ?? s.name ?? "",
        rows: (s.rows ?? []) as any[][],
      }));

      const result = await boqService.runDualImport(
        ctx,
        params.projectId,
        rawSheets,
        fileName,
        replaceExisting,
        selectedMode
      );

      if (result.pipeline.errors.length > 0) {
        return NextResponse.json(
          {
            success: false,
            batchId: result.batchId,
            mode: result.pipeline.mode,
            detectedMode: result.pipeline.detectedMode,
            errors: result.pipeline.errors,
            warnings: result.pipeline.warnings,
            summary: result.pipeline.summary,
            message:
              `Import failed with ${result.pipeline.errors.length} error(s). ` +
              `Fix the Excel file and re-upload.`,
          },
          { status: 422 }
        );
      }

      logger.info({
        msg: "boq_import_succeeded",
        projectId: params.projectId,
        userId: ctx.userId,
        mode: result.pipeline.mode,
        detectedMode: result.pipeline.detectedMode,
        inserted: result.inserted.length,
        warnings: result.pipeline.warnings.length,
      });

      return NextResponse.json(
        {
          success: true,
          batchId: result.batchId,
          imported: result.inserted.length,
          source: fileName,
          mode: result.pipeline.mode,
          detectedMode: result.pipeline.detectedMode,
          summary: result.pipeline.summary,
          warnings: result.pipeline.warnings,
          message: `${result.inserted.length} BOQ items imported from ${fileName}`,
        },
        { status: 201 }
      );
    }

    // ─── Mode C: Legacy items (back-compat) ───────────────────────────────
    if (body.items && Array.isArray(body.items)) {
      if (replaceExisting) {
        const { boqRepository } = await import("@/lib/boq");
        if (await boqRepository.isLocked(ctx, params.projectId)) {
          return NextResponse.json(
            {
              error:
                "Project BOQ is locked. Re-import requires Super Admin to unlock first.",
              code: "BOQ_LOCKED",
            },
            { status: 403 }
          );
        }
        await boqRepository.replaceForProject(ctx, params.projectId);
      }

      const inserted: any[] = [];
      let sortOrder = 0;
      for (const raw of body.items) {
        const isGroup = raw.is_group ?? raw.isGroup ?? false;
        const qty =
          raw.tender_qty !== undefined
            ? parseFloat(raw.tender_qty)
            : raw.quantity !== undefined
            ? parseFloat(raw.quantity)
            : null;
        const rate =
          raw.rate !== undefined
            ? parseFloat(raw.rate)
            : raw.contractRate !== undefined
            ? parseFloat(raw.contractRate)
            : null;

        const item = await boqService.addManualItem(ctx, params.projectId, {
          category: raw.category ?? "Civil Building",
          boq_no: raw.boq_no ?? raw.boqNo ?? `UNKNOWN-${++sortOrder}`,
          parent_boq_no: raw.parent_boq_no ?? raw.parentBoqNo ?? null,
          depth: raw.depth ?? 0,
          is_group: isGroup,
          display_name: (
            raw.display_name ??
            raw.displayName ??
            raw.description ??
            ""
          ).substring(0, 200),
          description: raw.fullDescription ?? raw.description ?? "",
          unit: isGroup ? null : raw.unit ?? raw.uomCode ?? null,
          tender_qty: isGroup ? null : qty,
          rate: isGroup ? null : rate,
        });
        inserted.push(item);
      }

      return NextResponse.json(
        {
          success: true,
          imported: inserted.length,
          source: fileName,
          message: `${inserted.length} BOQ items imported from ${fileName}`,
        },
        { status: 201 }
      );
    }

    return badRequest("Request must include 'rows' (preview round-trip), 'sheets' (raw grids), or 'items' (legacy)");
  } catch (err: any) {
    if (err instanceof BOQError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus }
      );
    }
    return NextResponse.json(
      { error: err.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
