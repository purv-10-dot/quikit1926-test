/**
 * GET /api/reports/canned/previews — bulk-runs the headline metric for
 * every canned report whose `id` is supplied in the `ids` query.
 *
 * Used by the hub to show a quick at-a-glance number on each card so the
 * user sees value before opening the drawer. Runs the requested reports
 * in parallel and returns just their `total` (plus a row count fallback
 * when the report doesn't expose a total).
 *
 * Returns 200 with `{ success: true, data: { items: [{ id, preview }] } }`
 * even when individual reports fail — failed entries get `preview: null`
 * so a single broken report doesn't break the entire hub.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  CANNED_REPORTS,
  getCannedReport,
  type CannedReport,
} from "@/lib/services/reports/canned";
import {
  parseQueryDateRange,
  resolveDefaultDateRange,
} from "@/lib/services/reports/canned/date-ranges";
import { readTzFromCookieHeader } from "@/lib/services/reports/csv-columns";
import type { SessionUser } from "@/types/permission";

export const runtime = "nodejs";

type PreviewItem = {
  id: string;
  preview: { label: string; value: number; display?: string } | null;
  error?: string;
};

async function runOne(
  report: CannedReport,
  user: SessionUser,
  searchParams: URLSearchParams,
  tz: string,
): Promise<PreviewItem> {
  try {
    const range =
      parseQueryDateRange(searchParams) ??
      resolveDefaultDateRange(report.defaultDateRange, tz);
    const ownerIdParam = searchParams.get("ownerId");
    const ownerId = ownerIdParam && ownerIdParam.trim() ? ownerIdParam : undefined;
    const result = await report.run({
      tenantId: user.tenantId,
      session: user,
      from: range.from,
      to: range.to,
      ownerId,
      tz,
    });
    if (result.total) {
      return { id: report.id, preview: result.total };
    }
    // Fall back to the row count when the report doesn't surface a total.
    return {
      id: report.id,
      preview: { label: "Rows", value: result.rows.length },
    };
  } catch (err) {
    return {
      id: report.id,
      preview: null,
      error: err instanceof Error ? err.message : "Failed",
    };
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "reports", "view");

    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get("ids");
    const ids = idsParam
      ? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
      : CANNED_REPORTS.map((r) => r.id);

    const reports = ids
      .map((id) => getCannedReport(id))
      .filter((r): r is CannedReport => !!r);

    const tz = readTzFromCookieHeader(req.headers.get("cookie"));
    const items = await Promise.all(reports.map((r) => runOne(r, user, searchParams, tz)));

    return NextResponse.json({ success: true, data: { items } });
  } catch (e) {
    return errorResponse(e);
  }
}
