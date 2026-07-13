/**
 * GET /api/priority/export — Global Export for Priority.
 *
 * Interval = fiscal YEAR + one or more QUARTERS. Each quarter becomes its own
 * sheet/section with that quarter's Week N status columns. Full-year = all four
 * quarters. Rows scoped + visibility-filtered per quarter via the SAME
 * `buildPriorityScopeWhere` the list route uses. Node runtime.
 */
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { buildPriorityScopeWhere } from "@/lib/api/priorityListQuery";
import { exportBaseSchema, quarterRangeSchema, searchParamsToObject } from "@/lib/exports/exportParams";
import { getQuarterWeekCounts, weekNumbers } from "@/lib/exports/quarterWeeks";
import { priorityExportColumns, type PriorityExportRow } from "@/lib/exports/columns/priorityExportColumns";
import { buildWorkbookSheets, type WorkbookSheet } from "@/lib/exports/buildWorkbook";
import { fileResponse } from "@/lib/exports/exportResponse";
import { fiscalYearLabel } from "@/lib/utils/fiscal";

const auth = withOrgAuthForResource("priority", "Priority");
const MAX_EXPORT_ROWS = 5000;

function fullName(u: { firstName: string | null; lastName: string | null } | null | undefined): string {
  if (!u) return "";
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
}

const PRIORITY_SELECT = {
  name: true,
  owner: true,
  startWeek: true,
  endWeek: true,
  importedFromOpsp: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  owner_user: { select: { firstName: true, lastName: true } },
  team: { select: { name: true } },
  weeklyStatuses: { select: { weekNumber: true, status: true, notes: true, updatedAt: true } },
} as const;

export const GET = auth.view(async ({ orgId, userId }, req) => {
  const sp = req.nextUrl.searchParams;
  const obj = searchParamsToObject(sp);

  const base = exportBaseSchema.safeParse(obj);
  if (!base.success) return NextResponse.json({ success: false, error: "Invalid export params" }, { status: 400 });
  const qr = quarterRangeSchema.safeParse(obj);
  if (!qr.success) return NextResponse.json({ success: false, error: "A year and at least one quarter are required." }, { status: 400 });

  const { year, quarters } = qr.data;
  const status = sp.get("status") || undefined;
  const owner = sp.get("owner") || undefined;
  const teamId = sp.get("teamId") || undefined;
  const includeDeleted = sp.get("includeDeleted") === "true";

  const weekCounts = await getQuarterWeekCounts(orgId, year, quarters);

  const perQuarter: Array<{ quarter: string; priorities: Array<Record<string, unknown>> }> = [];
  const userIds = new Set<string>();
  for (const quarter of quarters) {
    const where = await buildPriorityScopeWhere(
      { orgId, userId },
      { year, quarter, status, owner, teamId, includeDeleted },
    );
    const priorities = await db.priority.findMany({
      where,
      select: PRIORITY_SELECT,
      orderBy: { createdAt: "desc" },
      take: MAX_EXPORT_ROWS,
    });
    for (const p of priorities) {
      if (p.createdBy) userIds.add(p.createdBy);
      if (p.updatedBy) userIds.add(p.updatedBy);
    }
    perQuarter.push({ quarter, priorities: priorities as Array<Record<string, unknown>> });
  }

  const userMap = userIds.size
    ? new Map(
        (
          await db.user.findMany({
            where: { id: { in: [...userIds] } },
            select: { id: true, firstName: true, lastName: true },
          })
        ).map((u) => [u.id, u]),
      )
    : new Map<string, { firstName: string | null; lastName: string | null }>();

  const toRow = (p: any): PriorityExportRow => {
    const weekStatusMap: Record<number, string> = {};
    let latest: { weekNumber: number; notes: string | null; updatedAt: Date } | null = null;
    for (const ws of p.weeklyStatuses ?? []) {
      weekStatusMap[ws.weekNumber] = ws.status ?? "";
      if (ws.notes && (!latest || ws.updatedAt > latest.updatedAt)) {
        latest = { weekNumber: ws.weekNumber, notes: ws.notes, updatedAt: ws.updatedAt };
      }
    }
    return {
      name: p.name,
      teamName: p.team?.name ?? "",
      ownerName: fullName(p.owner_user),
      startWeek: p.startWeek,
      endWeek: p.endWeek,
      lastNote: latest ? `W${latest.weekNumber}: ${latest.notes}` : "",
      importedFromOpsp: p.importedFromOpsp ?? false,
      createdByName: p.createdBy ? fullName(userMap.get(p.createdBy)) : "",
      updatedByName: p.updatedBy ? fullName(userMap.get(p.updatedBy)) : "",
      createdAt: p.createdAt ?? null,
      updatedAt: p.updatedAt ?? null,
      weekStatusMap,
    };
  };

  const sheets: WorkbookSheet[] = [];
  for (const { quarter, priorities } of perQuarter) {
    const weeks = weekNumbers(weekCounts[quarter] ?? 13);
    const columns = priorityExportColumns(base.data.columns, weeks);
    if (columns.length === 0) {
      return NextResponse.json({ success: false, error: "Select at least one column." }, { status: 400 });
    }
    const headers = columns.map((c) => c.label);
    const rowObjs = priorities.map(toRow);
    const rows = rowObjs.map((r) => columns.map((c) => c.value(r)));
    const fills = rowObjs.map((r) => columns.map((c) => c.fill?.(r)));
    sheets.push({ sheetName: quarter, headers, rows, fills });
  }

  const fyBits = fiscalYearLabel(year).replace(/[^0-9-]/g, "");
  const qBits = quarters.length === 4 ? "FullYear" : quarters.join("-");
  const baseName = `Priorities-${fyBits}-${qBits}`;
  const dateSuffix = new Date().toISOString().slice(0, 10);

  const body = await buildWorkbookSheets(sheets);
  return fileResponse(body, baseName, dateSuffix);
});
