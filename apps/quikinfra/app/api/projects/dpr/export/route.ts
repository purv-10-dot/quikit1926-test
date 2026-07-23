import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { parseSort } from "@/lib/http/pagination";

/**
 * GET /api/projects/dpr/export
 *
 * Streams the DPR list as a multi-sheet `.xlsx`. Reuses the exact same filters
 * as the list GET (status, projectId, search, fromDate, toDate) so the export
 * matches whatever the user is viewing — the WHERE is built server-side, not
 * from the loaded page. Pagination is intentionally ignored (capped export).
 *
 * Sheets: a DPRs summary + one sheet per section (Work Done, Materials,
 * Manpower, Staff, Machinery), each row keyed by DPR Number, with all ids
 * resolved to labels (BOQ no / item / uom / work-order / contractor).
 */

const EXPORT_ROW_CAP = 2000;

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved_l1: "Approved (L1)",
  approved: "Approved",
  rejected: "Rejected",
};

const num = (v: unknown) => Number((v as { toString?: () => string })?.toString?.() ?? v ?? 0) || 0;

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const projectId = searchParams.get("projectId") ?? "";
  const search = (searchParams.get("search") ?? "").trim();
  const fromDate = searchParams.get("fromDate") ?? "";
  const toDate = searchParams.get("toDate") ?? "";

  const ctxOrResp = await requireProjectsFinanceAction("construction.dpr", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  // Mirror the list route's WHERE construction exactly so the export matches
  // the on-screen list (see app/api/projects/dpr/route.ts GET).
  const where: Record<string, unknown> = { orgId: ctx.orgId };
  if (Array.isArray(ctx.projectIds) && ctx.projectIds.length > 0) {
    where.projectId = { in: ctx.projectIds };
  }
  where.status = { not: "inactive" };
  if (status && status !== "all") where.status = status;
  if (projectId) where.projectId = projectId;
  if (search) {
    where.OR = [
      { dprNumber: { contains: search, mode: "insensitive" } },
      { remarks: { contains: search, mode: "insensitive" } },
      { project: { is: { name: { contains: search, mode: "insensitive" } } } },
    ];
  }
  if (fromDate || toDate) {
    const range: Record<string, Date> = {};
    if (fromDate) range.gte = new Date(fromDate);
    if (toDate) range.lte = new Date(`${toDate}T23:59:59.999Z`);
    where.reportDate = range;
  }

  const { orderBy } = parseSort(
    searchParams,
    ["dprNumber", "reportDate", "status", "createdAt"],
    { field: "reportDate", order: "desc" },
  );

  const rows = await db.cnDailyProgressReport.findMany({
    where,
    orderBy,
    take: EXPORT_ROW_CAP,
    include: {
      project: { select: { name: true, code: true } },
      workItems: true,
      materialEntries: true,
      labourEntries: true,
      staffEntries: true,
      machineryEntries: true,
    },
  });

  // ── Batch id → label resolution across every DPR in the result set ──
  const boqIds = new Set<string>();
  const itemIds = new Set<string>();
  const uomIds = new Set<string>();
  const woIds = new Set<string>();
  const contractorIds = new Set<string>();
  for (const r of rows) {
    for (const w of r.workItems) {
      if (w.boqItemId) boqIds.add(w.boqItemId);
      if (w.uomId) uomIds.add(w.uomId);
      if (w.woId) woIds.add(w.woId);
    }
    for (const m of r.materialEntries) {
      if (m.itemId) itemIds.add(m.itemId);
      if (m.uomId) uomIds.add(m.uomId);
    }
    for (const l of r.labourEntries) {
      if (l.contractorId) contractorIds.add(l.contractorId);
    }
  }

  const [boqRows, itemRows, uomRows, woRows] = await Promise.all([
    boqIds.size
      ? db.cnBOQItemV2.findMany({
          where: { id: { in: [...boqIds] }, orgId: ctx.orgId },
          select: { id: true, boqNo: true, unit: true, scopeQty: true },
        })
      : Promise.resolve([]),
    itemIds.size
      ? db.cnItem.findMany({
          where: { id: { in: [...itemIds] }, orgId: ctx.orgId },
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
    uomIds.size
      ? db.cnUOM.findMany({
          where: { id: { in: [...uomIds] } },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
    woIds.size
      ? db.cnWorkOrder.findMany({
          where: { id: { in: [...woIds] }, orgId: ctx.orgId },
          select: { id: true, woNumber: true, contractorId: true },
        })
      : Promise.resolve([]),
  ]);

  // Work orders carry their contractor id — fold those in before resolving names.
  for (const wo of woRows) if (wo.contractorId) contractorIds.add(wo.contractorId);
  const contractorRows = contractorIds.size
    ? await db.cnContractor.findMany({
        where: { id: { in: [...contractorIds] }, orgId: ctx.orgId },
        select: { id: true, name: true },
      })
    : [];

  const boqNoById = new Map(boqRows.map((b) => [b.id, b.boqNo]));
  const boqUnitById = new Map(boqRows.map((b) => [b.id, b.unit ?? ""]));
  const boqScopeById = new Map(boqRows.map((b) => [b.id, num(b.scopeQty)]));
  const itemNameById = new Map(
    itemRows.map((i) => [i.id, i.code ? `${i.code} — ${i.name}` : i.name]),
  );
  const uomById = new Map(uomRows.map((u) => [u.id, u.code]));
  const contractorNameById = new Map(contractorRows.map((c) => [c.id, c.name]));
  const woLabelById = new Map(
    woRows.map((wo) => {
      const cn = wo.contractorId ? contractorNameById.get(wo.contractorId) : "";
      return [wo.id, cn ? `${wo.woNumber} · ${cn}` : wo.woNumber];
    }),
  );

  // ── Build the sheets ──
  const summaryAoa: Array<Array<string | number>> = [
    ["Date", "DPR Number", "Project", "Status", "Weather", "Site Remarks", "Work Done", "Materials", "Manpower", "Staff", "Machinery"],
  ];
  const workAoa: Array<Array<string | number>> = [
    ["DPR Number", "BOQ Ref", "Description", "Unit", "Total Target", "Contractor / WO", "Prev Qty", "Today's Qty", "Cumulative", "% Completed", "Location / Chainage", "Remarks"],
  ];
  const materialAoa: Array<Array<string | number>> = [
    ["DPR Number", "Material", "UOM", "Consumed Qty", "Remarks"],
  ];
  const manpowerAoa: Array<Array<string | number>> = [
    ["DPR Number", "Contractor", "Working Area", "Messan", "Male Helper", "Female Helper", "Carpenter", "Fitter", "Painter", "Plumber", "Electrician", "Operator", "Total"],
  ];
  const staffAoa: Array<Array<string | number>> = [
    ["DPR Number", "Name", "Designation", "Present", "Reason"],
  ];
  const machineryAoa: Array<Array<string | number>> = [
    ["DPR Number", "Description", "Condition", "Required Qty", "Actual Qty", "Remarks"],
  ];

  for (const r of rows) {
    const dprNo = r.dprNumber ?? "";
    summaryAoa.push([
      fmtDate(r.reportDate),
      dprNo,
      r.project?.name ?? "",
      STATUS_LABELS[r.status ?? ""] ?? r.status ?? "",
      r.weatherCondition ?? "",
      r.remarks ?? "",
      r.workItems.length,
      r.materialEntries.length,
      r.labourEntries.length,
      r.staffEntries.length,
      r.machineryEntries.length,
    ]);

    for (const w of r.workItems) {
      const cumulative = num(w.cumulativeQty);
      const today = num(w.todayQty);
      const prev = Math.max(0, cumulative - today);
      const target = w.boqItemId ? boqScopeById.get(w.boqItemId) ?? 0 : 0;
      workAoa.push([
        dprNo,
        (w.boqItemId ? boqNoById.get(w.boqItemId) : "") || "",
        w.description ?? "",
        (w.boqItemId ? boqUnitById.get(w.boqItemId) : "") || uomById.get(w.uomId ?? "") || "",
        target,
        w.woId ? woLabelById.get(w.woId) ?? "" : "Self Work",
        prev,
        today,
        cumulative,
        target > 0 ? Number(Math.min(100, (cumulative / target) * 100).toFixed(1)) : 0,
        w.location ?? "",
        w.remarks ?? "",
      ]);
    }

    for (const m of r.materialEntries) {
      materialAoa.push([
        dprNo,
        (m.itemId ? itemNameById.get(m.itemId) : "") || m.itemId || "",
        uomById.get(m.uomId ?? "") ?? "",
        num(m.consumedQty),
        m.remarks ?? "",
      ]);
    }

    for (const l of r.labourEntries) {
      const tradeTotal =
        num(l.messan) + num(l.maleHelper) + num(l.femaleHelper) + num(l.carpenter) +
        num(l.fitter) + num(l.painter) + num(l.plumber) + num(l.electrician) + num(l.operator);
      manpowerAoa.push([
        dprNo,
        (l.contractorId ? contractorNameById.get(l.contractorId) : "") || l.category || "Self",
        l.workingArea ?? "",
        num(l.messan),
        num(l.maleHelper),
        num(l.femaleHelper),
        num(l.carpenter),
        num(l.fitter),
        num(l.painter),
        num(l.plumber),
        num(l.electrician),
        num(l.operator),
        tradeTotal > 0 ? tradeTotal : num(l.count),
      ]);
    }

    for (const s of r.staffEntries) {
      staffAoa.push([
        dprNo,
        s.name ?? "",
        s.designation ?? "",
        s.present !== false ? "Present" : "Absent",
        s.reason ?? "",
      ]);
    }

    for (const mc of r.machineryEntries) {
      machineryAoa.push([
        dprNo,
        mc.description ?? "",
        mc.condition ?? "",
        num(mc.requiredQty),
        num(mc.actualQty),
        mc.remarks ?? "",
      ]);
    }
  }

  const wb = XLSX.utils.book_new();
  const addSheet = (name: string, aoa: Array<Array<string | number>>, widths: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet("DPRs", summaryAoa, [14, 24, 26, 14, 12, 40, 11, 11, 11, 9, 11]);
  addSheet("Work Done", workAoa, [22, 12, 40, 10, 12, 26, 11, 11, 12, 12, 20, 30]);
  addSheet("Materials", materialAoa, [22, 30, 10, 14, 30]);
  addSheet("Manpower", manpowerAoa, [22, 24, 20, 10, 12, 13, 11, 9, 9, 9, 11, 10, 9]);
  addSheet("Staff", staffAoa, [22, 24, 22, 10, 30]);
  addSheet("Machinery", machineryAoa, [22, 30, 14, 13, 12, 30]);

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="dpr-export-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}