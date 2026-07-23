import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { parsePagination } from "@/lib/http/pagination";

/**
 * GET /api/projects/work-orders/export
 *
 * Streams the Work Order list as a multi-sheet `.xlsx`. Reuses the exact same
 * filters as the list GET (status, projectId, contractorId, search) so the
 * export matches the on-screen list — the WHERE is built server-side, not from
 * the loaded page. Pagination is ignored (capped export).
 *
 * Sheets: a Work Orders summary + a WO Lines sheet (each line keyed by WO
 * Number), with ids resolved to labels (BOQ no / uom).
 */

const EXPORT_ROW_CAP = 2000;

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  in_progress: "In Progress",
  completed: "Completed",
  rejected: "Rejected",
  closed: "Closed",
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
  const contractorId = searchParams.get("contractorId") ?? "";
  const search = (searchParams.get("search") ?? "").toLowerCase().trim();

  const ctxOrResp = await requireProjectsFinanceAction("construction.wo", "view");
  if (ctxOrResp instanceof NextResponse) return ctxOrResp;
  const ctx = ctxOrResp;

  // Mirror the list route's WHERE construction exactly (see
  // app/api/projects/work-orders/route.ts GET).
  const where: Record<string, unknown> = { orgId: ctx.orgId };
  if (Array.isArray(ctx.projectIds) && ctx.projectIds.length > 0) {
    where.projectId = { in: ctx.projectIds };
  }
  where.status = { not: "inactive" };
  if (status && status !== "all") where.status = status;
  if (projectId) where.projectId = projectId;
  if (contractorId) where.contractorId = contractorId;
  if (search) {
    where.OR = [
      { woNumber: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
      { project: { is: { name: { contains: search, mode: "insensitive" } } } },
      { contractor: { is: { name: { contains: search, mode: "insensitive" } } } },
    ];
  }

  const _p = parsePagination(req);
  void _p; // export ignores pagination — full filtered set (capped below).

  const rows = await db.cnWorkOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: EXPORT_ROW_CAP,
    include: {
      project: { select: { name: true } },
      contractor: { select: { name: true } },
      lines: true,
    },
  });

  // ── Batch id → label resolution (BOQ no + uom) across every line ──
  const boqIds = new Set<string>();
  const uomIds = new Set<string>();
  for (const r of rows) {
    for (const l of r.lines) {
      if (l.boqItemId) boqIds.add(l.boqItemId);
      if (l.uomId) uomIds.add(l.uomId);
    }
  }
  const [boqRows, uomRows] = await Promise.all([
    boqIds.size
      ? db.cnBOQItemV2.findMany({
          where: { id: { in: [...boqIds] }, orgId: ctx.orgId },
          select: { id: true, boqNo: true },
        })
      : Promise.resolve([]),
    uomIds.size
      ? db.cnUOM.findMany({
          where: { id: { in: [...uomIds] } },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
  ]);
  const boqNoById = new Map(boqRows.map((b) => [b.id, b.boqNo]));
  const uomById = new Map(uomRows.map((u) => [u.id, u.code]));

  // ── Build the sheets ──
  const summaryAoa: Array<Array<string | number>> = [
    ["WO Number", "Project", "Contractor", "Work Type", "Status", "Start", "End", "Total Value", "Lines"],
  ];
  const lineAoa: Array<Array<string | number>> = [
    ["WO Number", "Line Type", "BOQ Ref", "Activity", "Description", "Unit", "Quantity", "Rate", "Amount", "Line Date"],
  ];

  for (const r of rows) {
    const woNo = r.woNumber ?? "";
    summaryAoa.push([
      woNo,
      r.project?.name ?? "",
      r.contractor?.name ?? "",
      r.workType ?? "",
      STATUS_LABELS[r.status ?? ""] ?? r.status ?? "",
      fmtDate(r.startDate),
      fmtDate(r.endDate),
      num(r.totalAmount),
      r.lines.length,
    ]);

    for (const l of r.lines) {
      lineAoa.push([
        woNo,
        l.lineType ?? "boq",
        (l.boqItemId ? boqNoById.get(l.boqItemId) : "") || "",
        l.activityName ?? "",
        l.description ?? "",
        uomById.get(l.uomId ?? "") ?? "",
        num(l.quantity),
        num(l.negotiatedRate),
        num(l.amount),
        fmtDate(l.lineDate),
      ]);
    }
  }

  const wb = XLSX.utils.book_new();
  const addSheet = (name: string, aoa: Array<Array<string | number>>, widths: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  addSheet("Work Orders", summaryAoa, [22, 26, 24, 14, 16, 14, 14, 14, 8]);
  addSheet("WO Lines", lineAoa, [22, 10, 12, 24, 40, 10, 12, 12, 14, 14]);

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="work-orders-export-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}