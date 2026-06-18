import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { loadExecutiveEmployees } from "@/lib/reports/executive-employees";

/**
 * Paginated full employee list for the Executive Report's "Top Employees"
 * table — the main /api/reports/executive payload only carries the top 10, so
 * "View All" pages through the rest here. Productivity is a computed sort, so
 * we aggregate the full list and slice (offset/limit). Same filter params as
 * the main report (preset/year/.../projectIds/assigneeIds/teamIds/sprintIds).
 */
export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));

  const all = await loadExecutiveEmployees({ orgId, userId, searchParams: url.searchParams });
  const rows = all.slice(offset, offset + limit);

  return NextResponse.json({
    success: true,
    data: { rows, total: all.length, hasMore: offset + rows.length < all.length },
  });
});
