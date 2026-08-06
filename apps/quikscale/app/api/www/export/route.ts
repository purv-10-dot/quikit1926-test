/**
 * GET /api/www/export — Global Export for WWW.
 *
 * Date-based interval: from/to ("YYYY-MM-DD") filter the `when` due date. Rows
 * are scoped + visibility-filtered via the SAME `buildWwwScopeWhere` the list
 * route uses. Node runtime (ExcelJS + @react-pdf/renderer).
 */
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { buildWwwScopeWhere } from "@/lib/api/wwwListQuery";
import { exportBaseSchema, dateRangeSchema, searchParamsToObject } from "@/lib/exports/exportParams";
import { dateRangeToWhere } from "@/lib/exports/rangeFilter";
import { wwwExportColumns, type WwwExportRow } from "@/lib/exports/columns/wwwExportColumns";
import { buildWorkbook } from "@/lib/exports/buildWorkbook";
import { fileResponse } from "@/lib/exports/exportResponse";

const auth = withOrgAuthForResource("www", "WWW");
const MAX_EXPORT_ROWS = 5000;

function fullName(u: { firstName: string | null; lastName: string | null } | null | undefined): string {
  if (!u) return "";
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
}

export const GET = auth.view(async ({ orgId, userId }, req) => {
  const sp = req.nextUrl.searchParams;
  const obj = searchParamsToObject(sp);

  const base = exportBaseSchema.safeParse(obj);
  if (!base.success) return NextResponse.json({ success: false, error: "Invalid export params" }, { status: 400 });
  const date = dateRangeSchema.safeParse(obj);
  if (!date.success) return NextResponse.json({ success: false, error: "Invalid date range" }, { status: 400 });

  const where = await buildWwwScopeWhere(
    { orgId, userId },
    {
      status: sp.get("status") || undefined,
      who: sp.get("who") || undefined,
      teamId: sp.get("teamId") || undefined,
      includeDeleted: sp.get("includeDeleted") === "true",
    },
  );
  // Merge the From/To interval onto the `when` due date. Empty range → {} (all).
  Object.assign(where, dateRangeToWhere("when", date.data.from, date.data.to));

  const items = await db.wWWItem.findMany({
    where,
    select: {
      who: true,
      when: true,
      dueDateTBD: true,
      what: true,
      revisedDates: true,
      status: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      createdBy: true,
      updatedBy: true,
    },
    orderBy: { when: "desc" },
    take: MAX_EXPORT_ROWS,
  });

  const userIds = new Set<string>();
  for (const i of items) {
    if (i.who) userIds.add(i.who);
    if (i.createdBy) userIds.add(i.createdBy);
    if (i.updatedBy) userIds.add(i.updatedBy);
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

  const rows: WwwExportRow[] = items.map((i) => {
    const revised = Array.isArray(i.revisedDates) ? (i.revisedDates as string[]) : [];
    const lastRevised = revised.length ? revised[revised.length - 1] : "";
    return {
      whoName: i.who ? fullName(userMap.get(i.who)) : "",
      when: i.when ?? null,
      dueDateTBD: i.dueDateTBD,
      what: i.what,
      revisedDate: lastRevised ? new Date(lastRevised).toISOString().slice(0, 10) : "",
      status: i.status,
      notes: i.notes,
      createdByName: i.createdBy ? fullName(userMap.get(i.createdBy)) : "",
      updatedByName: i.updatedBy ? fullName(userMap.get(i.updatedBy)) : "",
      createdAt: i.createdAt ?? null,
      updatedAt: i.updatedAt ?? null,
    };
  });

  const columns = wwwExportColumns(base.data.columns);
  if (columns.length === 0) return NextResponse.json({ success: false, error: "Select at least one column." }, { status: 400 });

  const headers = columns.map((c) => c.label);
  const matrix = rows.map((r) => columns.map((c) => c.value(r)));
  const fills = rows.map((r) => columns.map((c) => c.fill?.(r)));

  const rangeBits = [date.data.from, date.data.to].filter(Boolean);
  const baseName = `WWW${rangeBits.length ? "-" + rangeBits.join("_to_") : ""}`;
  const dateSuffix = new Date().toISOString().slice(0, 10);

  const body = await buildWorkbook({ sheetName: "WWW", headers, rows: matrix, fills });
  return fileResponse(body, baseName, dateSuffix);
});
