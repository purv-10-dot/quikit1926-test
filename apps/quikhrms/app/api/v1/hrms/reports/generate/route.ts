import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, forbidden, internalError, notFound } from "@/lib/api-response";
import { generateReportSchema } from "@/lib/validations/system";
import { createAuditLog } from "@/lib/utils/audit";
import { resolveReport, canRunReport, reportRequiredPermission } from "@/lib/reports/registry";
import { renderReport } from "@/lib/reports/engine";
import type { ReportContext } from "@/lib/reports/types";

// Reports fetch all rows and render in-request — cap to avoid memory blowups / DoS.
const MAX_REPORT_ROWS = 50_000;

/**
 * POST /api/v1/hrms/reports/generate
 *   { key | entity, format: json|csv|xlsx|pdf, dateFrom?, dateTo?, filters? }
 * format=json  → { title, columns, rows } for on-screen preview.
 * format=csv|xlsx|pdf → binary file download.
 */
export const POST = withAuth(async (req: NextRequest, authCtx) => {
  try {
    const { orgId, userId } = authCtx;
    const body = await req.json();
    const parsed = generateReportSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { key, entity, dateFrom, dateTo, filters, format } = parsed.data;
    const report = resolveReport((key ?? entity)!);
    if (!report) return notFound(`Unknown report: ${key ?? entity}`);

    // Per-report authorization: sensitive comp/statutory/tax reports require the
    // elevated permission. Previously ANY authenticated member could dump full
    // salary + bank + PAN/Aadhaar.
    if (!canRunReport(report, authCtx.permissions)) {
      return forbidden(`You don't have permission to run this report (requires ${reportRequiredPermission(report)}).`);
    }

    const ctx: ReportContext = {
      orgId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      filters,
    };
    const result = await report.run(ctx);

    if (result.rows.length > MAX_REPORT_ROWS) {
      return validationError(`This report returned ${result.rows.length} rows (max ${MAX_REPORT_ROWS}). Narrow the date range or filters.`);
    }

    await createAuditLog({
      orgId, userId, action: "Export", entityType: "report",
      metadata: { key: report.key, format, rowCount: result.rows.length },
    });

    if (format === "json") {
      return successResponse({ title: result.title, columns: result.columns, rows: result.rows, totalRows: result.rows.length });
    }

    const file = await renderReport(result, format);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(file.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${report.key}-${stamp}.${file.ext}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("POST /reports/generate error:", error);
    return internalError();
  }
}, {
  // Must hold at least one report-capable permission; the handler then enforces
  // the specific report's requirement.
  requiredPermissions: ["hrms.reports.read", "hrms.reports.manage", "hrms.audit.read"],
  anyPermission: true,
  // Each run fetches all rows + renders a file — throttle per user.
  rateLimit: { max: 20, windowSec: 60, by: "user" },
});
