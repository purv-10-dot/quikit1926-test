import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, internalError, notFound } from "@/lib/api-response";
import { generateReportSchema } from "@/lib/validations/system";
import { createAuditLog } from "@/lib/utils/audit";
import { resolveReport } from "@/lib/reports/registry";
import { renderReport } from "@/lib/reports/engine";
import type { ReportContext } from "@/lib/reports/types";

/**
 * POST /api/v1/hrms/reports/generate
 *   { key | entity, format: json|csv|xlsx|pdf, dateFrom?, dateTo?, filters? }
 * format=json  → { title, columns, rows } for on-screen preview.
 * format=csv|xlsx|pdf → binary file download.
 */
export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = generateReportSchema.safeParse(body);
    if (!parsed.success) return validationError("Validation failed", parsed.error.flatten().fieldErrors);

    const { key, entity, dateFrom, dateTo, filters, format } = parsed.data;
    const report = resolveReport((key ?? entity)!);
    if (!report) return notFound(`Unknown report: ${key ?? entity}`);

    const ctx: ReportContext = {
      orgId,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      filters,
    };
    const result = await report.run(ctx);

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
});
