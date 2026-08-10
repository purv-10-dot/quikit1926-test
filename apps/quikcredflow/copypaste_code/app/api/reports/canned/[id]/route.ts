/**
 * GET /api/reports/canned/[id] — run a canned report.
 *
 * Query:
 *   - `from`, `to` — ISO timestamps. When either is missing we fall
 *     back to the report's `defaultDateRange` resolved in the user's tz.
 *   - `ownerId` — optional, forwarded into the run context.
 *   - `format=csv|xlsx` — stream the result as CSV or Excel (both gated
 *     on `reports.export`). Otherwise return
 *     `{ success: true, data: CannedReportResult }`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  getCannedReport,
  type CannedReportResult,
} from "@/lib/services/reports/canned";
import {
  parseQueryDateRange,
  resolveDefaultDateRange,
} from "@/lib/services/reports/canned/date-ranges";
import { type CsvColumn } from "@/lib/services/reports/csv-stream";
import { readTzFromCookieHeader } from "@/lib/services/reports/csv-columns";
import {
  dispatchExport,
  parseReportFormat,
} from "@/lib/services/reports/format-dispatch";

export const runtime = "nodejs";

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00:00";
  const s = Math.floor(seconds);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function reportToCsvColumns(
  result: CannedReportResult,
): CsvColumn<Record<string, unknown>>[] {
  return result.columns.map((c) => {
    if (c.format === "duration") {
      return {
        key: c.key,
        label: c.label,
        format: (row) => formatDuration(Number(row[c.key] ?? 0)),
      };
    }
    if (c.format === "percent") {
      return {
        key: c.key,
        label: c.label,
        format: (row) => `${Number(row[c.key] ?? 0)}%`,
      };
    }
    if (c.format === "date") {
      return {
        key: c.key,
        label: c.label,
        format: (row) => {
          const v = row[c.key];
          if (!v) return "";
          const d = v instanceof Date ? v : new Date(String(v));
          return Number.isNaN(d.getTime()) ? "" : d.toISOString();
        },
      };
    }
    return {
      key: c.key,
      label: c.label,
      format: (row) => row[c.key] as string | number | null | undefined,
    };
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "reports", "view");

    const { id } = await params;
    const report = getCannedReport(id);
    if (!report) {
      return NextResponse.json(
        { success: false, error: `Canned report "${id}" not found` },
        { status: 404 },
      );
    }

    const { searchParams } = new URL(req.url);
    const tz = readTzFromCookieHeader(req.headers.get("cookie"));
    const range =
      parseQueryDateRange(searchParams) ??
      resolveDefaultDateRange(report.defaultDateRange, tz);
    const ownerIdParam = searchParams.get("ownerId");
    const ownerId = ownerIdParam && ownerIdParam.trim() ? ownerIdParam : undefined;

    const ctx = {
      tenantId: user.tenantId,
      session: user,
      from: range.from,
      to: range.to,
      ownerId,
      tz,
    } as const;
    const result = await report.run(ctx);

    // Pre-compute per-row drill URLs server-side so the client doesn't
    // need to mirror the catalog's `buildDrillUrl` closures.
    const enrichedRows = report.buildDrillUrl
      ? result.rows.map((row) => ({
          ...row,
          _drillUrl: report.buildDrillUrl!(row, ctx),
        }))
      : result.rows;
    const enrichedResult = { ...result, rows: enrichedRows };

    const format = parseReportFormat(searchParams);
    if (format) {
      const cols = reportToCsvColumns(result);
      async function* iter() {
        for (const row of result.rows) yield row;
      }
      return dispatchExport({
        format,
        user,
        cookieHeader: req.headers.get("cookie"),
        rows: iter(),
        columns: cols,
        filenameStem: report.id,
      });
    }

    return NextResponse.json({ success: true, data: enrichedResult });
  } catch (e) {
    return errorResponse(e);
  }
}
