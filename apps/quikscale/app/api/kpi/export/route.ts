/**
 * GET /api/kpi/export — Global Export for Individual + Team KPI.
 *
 * Query params:
 *   format    "xlsx" | "pdf"            (default xlsx)
 *   columns   comma-separated col keys  (empty → all)
 *   level     "individual" | "team"     (default individual)
 *   year      fiscal year               (required)
 *   quarters  "Q1" or "Q1,Q2,Q3,Q4"     (required — one per exported sheet)
 *   owner, teamId, teamIds, includeDeleted   standard KPI filters
 *
 * The interval is a fiscal YEAR + one or more QUARTERS. Each quarter becomes
 * its OWN sheet (xlsx tab) / section (pdf), with that quarter's own Week 1..N
 * columns (week count resolved per-quarter from QuarterSetting). Full-year =
 * all four quarters. Rows are scoped + visibility-filtered per quarter via the
 * SAME `buildKpiScopeWhere` the list route uses. Node runtime.
 */
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { buildKpiScopeWhere } from "@/lib/api/kpiListQuery";
import { exportBaseSchema, quarterRangeSchema, searchParamsToObject } from "@/lib/exports/exportParams";
import { getQuarterWeekCounts, getQuarterWeekTiming, weekNumbers } from "@/lib/exports/quarterWeeks";
import { kpiExportColumns, type KpiExportRow } from "@/lib/exports/columns/kpiExportColumns";
import { computeExportStats } from "@/app/(dashboard)/kpi/components/kpiStats";
import type { KPIRow } from "@/lib/types/kpi";
import { buildWorkbookSheets, type WorkbookSheet } from "@/lib/exports/buildWorkbook";
import { fileResponse } from "@/lib/exports/exportResponse";
import { fiscalYearLabel } from "@/lib/utils/fiscal";

const auth = withOrgAuthForResource("kpi", "KPI");
const MAX_EXPORT_ROWS = 5000;

function fullName(u: { firstName: string | null; lastName: string | null } | null | undefined): string {
  if (!u) return "";
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
}

const KPI_SELECT = {
  name: true,
  description: true,
  kpiLevel: true,
  owner: true,
  ownerIds: true,
  teamId: true,
  measurementUnit: true,
  kpiType: true,
  target: true,
  quarterlyGoal: true,
  qtdGoal: true,
  qtdAchieved: true,
  progressPercent: true,
  divisionType: true,
  currency: true,
  targetScale: true,
  scaledDisplay: true,
  unit: true,
  lastNotes: true,
  importedFromOpsp: true,
  weeklyTargets: true,
  reverseColor: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
  owner_user: { select: { firstName: true, lastName: true } },
  team: { select: { name: true, headId: true } },
  weeklyValues: { select: { weekNumber: true, value: true } },
} as const;

export const GET = auth.view(async ({ orgId, userId }, req) => {
  const sp = req.nextUrl.searchParams;
  const obj = searchParamsToObject(sp);

  const base = exportBaseSchema.safeParse(obj);
  if (!base.success) return NextResponse.json({ success: false, error: "Invalid export params" }, { status: 400 });
  const qr = quarterRangeSchema.safeParse(obj);
  if (!qr.success) return NextResponse.json({ success: false, error: "A year and at least one quarter are required." }, { status: 400 });

  const { year, quarters } = qr.data;
  const level = sp.get("level") === "team" ? "team" : "individual";
  const teamIdsParam = sp.get("teamIds");
  const teamIdList = teamIdsParam ? teamIdsParam.split(",").filter(Boolean) : [];
  const owner = sp.get("owner") || undefined;
  const teamId = sp.get("teamId") || undefined;
  const includeDeleted = sp.get("includeDeleted") === "true";

  const weekCounts = await getQuarterWeekCounts(orgId, year, quarters);
  // Per-quarter week timing (display week + QTD reference week) — lets the export
  // recompute QTD Goal / Achieved / Progress / Weekly Goal the SAME way the KPI
  // table and Stats drawer do, instead of dumping the stale stored aggregates.
  const timing = await getQuarterWeekTiming(orgId, year, quarters, weekCounts);

  // Fetch each quarter's rows (scoped + visibility-filtered identically to the
  // list view), collecting every referenced user id for one batched name lookup.
  const perQuarter: Array<{ quarter: string; kpis: Array<Record<string, unknown>> }> = [];
  const userIds = new Set<string>();
  for (const quarter of quarters) {
    const where = await buildKpiScopeWhere(
      { orgId, userId },
      { kpiLevel: level, owner, teamId, teamIds: teamIdList, quarter, year, includeDeleted },
    );
    const kpis = await db.kPI.findMany({
      where,
      select: KPI_SELECT,
      orderBy: { createdAt: "desc" },
      take: MAX_EXPORT_ROWS,
    });
    for (const k of kpis) {
      if (k.createdBy) userIds.add(k.createdBy);
      if (k.updatedBy) userIds.add(k.updatedBy);
      if (k.team?.headId) userIds.add(k.team.headId);
      for (const id of (k.ownerIds as string[] | null) ?? []) userIds.add(id);
    }
    perQuarter.push({ quarter, kpis: kpis as Array<Record<string, unknown>> });
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

  const toRow = (k: any, quarter: string, currentWeek: number, qtdWeek: number, weekCount: number): KpiExportRow => {
    const weekMap: Record<number, number | null> = {};
    for (const wv of k.weeklyValues ?? []) {
      const prev = weekMap[wv.weekNumber];
      const val = wv.value ?? null;
      weekMap[wv.weekNumber] = val == null ? (prev ?? null) : (prev ?? 0) + val;
    }
    const ownerName = k.owner_user
      ? fullName(k.owner_user)
      : ((k.ownerIds as string[] | null) ?? []).map((id: string) => fullName(userMap.get(id))).filter(Boolean).join(", ");
    // Per-week target drives the traffic-light fill (value vs target).
    const weekTargetMap: Record<number, number> = {};
    const wt = (k.weeklyTargets ?? {}) as Record<string, unknown>;
    for (const [wk, tv] of Object.entries(wt)) {
      const n = Number(tv);
      if (Number.isFinite(n)) weekTargetMap[Number(wk)] = n;
    }
    // Recompute the stat columns from the per-week breakdown so the export
    // matches the KPI table / Stats drawer (which never read the stored
    // aggregates). Quarterly Goal stays the stored value — it already agrees.
    const stats = computeExportStats(k as KPIRow, currentWeek, qtdWeek, weekCount);
    return {
      quarter,
      name: k.name,
      ownerName,
      teamName: k.team?.name ?? "",
      teamHeadName: k.team?.headId ? fullName(userMap.get(k.team.headId)) : "",
      measurementUnit: k.measurementUnit,
      kpiType: k.kpiType ?? null,
      currency: k.currency ?? null,
      targetScale: k.targetScale ?? null,
      scaledDisplay: k.scaledDisplay ?? false,
      unit: k.unit ?? null,
      target: k.target,
      quarterlyGoal: k.quarterlyGoal,
      qtdGoal: stats.qtdGoal,
      qtdAchieved: stats.qtdAchieved,
      weeklyGoal: stats.weeklyGoal,
      progressPercent: stats.progressPercent,
      description: k.description,
      lastNotes: k.lastNotes,
      importedFromOpsp: k.importedFromOpsp ?? false,
      createdByName: k.createdBy ? fullName(userMap.get(k.createdBy)) : "",
      updatedByName: k.updatedBy ? fullName(userMap.get(k.updatedBy)) : "",
      createdAt: k.createdAt ?? null,
      updatedAt: k.updatedAt ?? null,
      weekMap,
      weekTargetMap,
      reverseColor: k.reverseColor ?? false,
    };
  };

  const sheets: WorkbookSheet[] = [];

  if (quarters.length === 1) {
    // ── Single quarter → one sheet named after the quarter (no Quarter col).
    const quarter = quarters[0];
    const kpis = perQuarter.find((p) => p.quarter === quarter)?.kpis ?? [];
    const weekCount = weekCounts[quarter] ?? 13;
    const weeks = weekNumbers(weekCount);
    const columns = kpiExportColumns(base.data.columns, weeks);
    if (columns.length === 0) {
      return NextResponse.json({ success: false, error: "Select at least one column." }, { status: 400 });
    }
    const { currentWeek, qtdWeek } = timing[quarter] ?? { currentWeek: 1, qtdWeek: 1 };
    const rowObjs = kpis.map((k) => toRow(k, quarter, currentWeek, qtdWeek, weekCount));
    sheets.push({
      sheetName: quarter,
      headers: columns.map((c) => c.label),
      rows: rowObjs.map((r) => columns.map((c) => c.value(r))),
      fills: rowObjs.map((r) => columns.map((c) => c.fill?.(r))),
    });
  } else {
    // ── Multiple quarters (Full Year / multi-select) → ONE combined sheet with
    //    a leading "Quarter" column, so every quarter's rows sit together
    //    instead of being split across per-quarter tabs (which read as "only
    //    Q1 has data" when later quarters are empty). Week columns span the
    //    widest quarter; each row's weekly values come from its own quarter,
    //    and QTD/Weekly stats are still computed per-quarter in toRow.
    const maxWeekCount = Math.max(...quarters.map((q) => weekCounts[q] ?? 13));
    const weeks = weekNumbers(maxWeekCount);
    const dataColumns = kpiExportColumns(base.data.columns, weeks);
    if (dataColumns.length === 0) {
      return NextResponse.json({ success: false, error: "Select at least one column." }, { status: 400 });
    }

    // Flatten every quarter's rows (kept in Q1→Q4 order), tagged with quarter.
    const rowObjs: KpiExportRow[] = [];
    for (const { quarter, kpis } of perQuarter) {
      const weekCount = weekCounts[quarter] ?? 13;
      const { currentWeek, qtdWeek } = timing[quarter] ?? { currentWeek: 1, qtdWeek: 1 };
      for (const k of kpis) rowObjs.push(toRow(k, quarter, currentWeek, qtdWeek, weekCount));
    }

    sheets.push({
      sheetName: quarters.length === 4 ? "Full Year" : quarters.join("-"),
      headers: ["Quarter", ...dataColumns.map((c) => c.label)],
      rows: rowObjs.map((r) => [r.quarter ?? "", ...dataColumns.map((c) => c.value(r))]),
      fills: rowObjs.map((r) => [undefined, ...dataColumns.map((c) => c.fill?.(r))]),
    });
  }

  const label = level === "team" ? "TeamKPI" : "IndividualKPI";
  const fyBits = fiscalYearLabel(year).replace(/[^0-9-]/g, "");
  const qBits = quarters.length === 4 ? "FullYear" : quarters.join("-");
  const baseName = `${label}-${fyBits}-${qBits}`;
  const dateSuffix = new Date().toISOString().slice(0, 10);

  const body = await buildWorkbookSheets(sheets);
  return fileResponse(body, baseName, dateSuffix);
});
