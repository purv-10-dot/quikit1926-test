import { NextResponse } from "next/server";
import { db } from "@/lib/db/prisma";
import { getTenantContext } from "@/lib/auth/context";

/**
 * GET /api/dashboard
 *
 * KPI tiles + recent activity for the dashboard. Backed by Postgres so the
 * numbers reflect the real transaction tables, not the in-memory demo store.
 *
 * Per-user project scoping: when `ctx.projectIds` is set (site-scoped users
 * with a non-empty `projectsAssigned` list), every count and recent-list
 * query is filtered to those projects only. Super/tenant admins and HO
 * users have `ctx.projectIds === undefined` and see global counts.
 */

const PENDING_APPROVAL_STATUSES = [
  "pending_approval",
  "submitted",
  "approved_l1",
  "approved_l2",
];

const OPEN_PO_STATUSES = [
  "approved",
  "partially_received",
  "sent",
  "awaiting_delivery",
  "pending_approval",
];

const ACTIVE_WO_STATUSES = [
  "active",
  "approved",
  "in_progress",
  "partially_completed",
];

const EMPTY_RESPONSE = {
  kpis: {
    activeProjects: 0,
    pendingApprovals: 0,
    openPOs: 0,
    lowStockItems: 0,
    grnThisMonth: 0,
    issuesThisMonth: 0,
    activeWOs: 0,
    pendingDPRApproval: 0,
  },
  recentActivity: { prs: [], pos: [] },
};

export async function GET() {
  try {
    const ctx = await getTenantContext();
    if (!ctx) return NextResponse.json(EMPTY_RESPONSE);

    const { tenantId, orgId, projectIds } = ctx;
    const restrict = Array.isArray(projectIds);
    const inProjects = restrict ? { projectId: { in: projectIds! } } : {};
    const tenantWhere = { tenantId, orgId };

    // Calendar-month bounds for "this month" KPIs. Done client-time-zone-naive
    // (server local) — close enough for an at-a-glance dashboard tile.
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const nextMonth = new Date(monthStart);
    nextMonth.setMonth(monthStart.getMonth() + 1);

    // All count queries run in parallel — single DB round-trip latency.
    const [
      activeProjects,
      pendingPRs,
      pendingPOs,
      pendingIndents,
      pendingDPRs,
      pendingGRNs,
      pendingWOs,
      openPOs,
      grnThisMonth,
      issuesThisMonth,
      activeWOs,
      items,
      recentPRsRaw,
      recentPOsRaw,
    ] = await Promise.all([
      (db as any).cnProject.count({
        where: {
          ...tenantWhere,
          status: "active",
          ...(restrict ? { id: { in: projectIds! } } : {}),
        },
      }),
      (db as any).cnPurchaseRequisition.count({
        where: { ...tenantWhere, ...inProjects, status: { in: PENDING_APPROVAL_STATUSES } },
      }),
      (db as any).cnPurchaseOrder.count({
        where: { ...tenantWhere, ...inProjects, status: { in: PENDING_APPROVAL_STATUSES } },
      }),
      (db as any).cnPurchaseIndent.count({
        where: { ...tenantWhere, ...inProjects, status: { in: PENDING_APPROVAL_STATUSES } },
      }),
      (db as any).cnDailyProgressReport.count({
        where: { ...tenantWhere, ...inProjects, status: { in: PENDING_APPROVAL_STATUSES } },
      }),
      (db as any).cnGoodsReceiptNote.count({
        where: { ...tenantWhere, ...inProjects, status: { in: PENDING_APPROVAL_STATUSES } },
      }),
      (db as any).cnWorkOrder.count({
        where: { ...tenantWhere, ...inProjects, status: { in: PENDING_APPROVAL_STATUSES } },
      }),
      (db as any).cnPurchaseOrder.count({
        where: { ...tenantWhere, ...inProjects, status: { in: OPEN_PO_STATUSES } },
      }),
      (db as any).cnGoodsReceiptNote.count({
        where: {
          ...tenantWhere,
          ...inProjects,
          grnDate: { gte: monthStart, lt: nextMonth },
        },
      }),
      (db as any).cnMaterialIssue.count({
        where: {
          ...tenantWhere,
          ...inProjects,
          issueDate: { gte: monthStart, lt: nextMonth },
        },
      }),
      (db as any).cnWorkOrder.count({
        where: { ...tenantWhere, ...inProjects, status: { in: ACTIVE_WO_STATUSES } },
      }),
      // Items master is tenant-global, not per-project. Low-stock detection
      // walks stock balances scoped to the user's projects below.
      (db as any).cnItem.findMany({
        where: { ...tenantWhere, status: "active" },
        select: { id: true, minStockLevel: true },
      }),
      (db as any).cnPurchaseRequisition.findMany({
        where: { ...tenantWhere, ...inProjects },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { project: { select: { name: true } } },
      }),
      (db as any).cnPurchaseOrder.findMany({
        where: { ...tenantWhere, ...inProjects },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          project: { select: { name: true } },
          vendor: { select: { name: true } },
        },
      }),
    ]);

    // Low-stock count: aggregate stock balances by item across the user's
    // visible projects, then mark each item as low-stock when its visible
    // total is below `minStockLevel`. Items master is global, balances are
    // per (project, location, item) so this is the only correct way to scope.
    const balances = await (db as any).cnStockBalance.findMany({
      where: { tenantId, orgId, ...(restrict ? { projectId: { in: projectIds! } } : {}) },
      select: { itemId: true, quantity: true },
    });
    const totalsByItem = new Map<string, number>();
    for (const r of balances as Array<{ itemId: string; quantity: any }>) {
      const q = Number(r.quantity ?? 0);
      totalsByItem.set(r.itemId, (totalsByItem.get(r.itemId) ?? 0) + q);
    }
    let lowStockItems = 0;
    for (const it of items as Array<{ id: string; minStockLevel: any }>) {
      const min = Number(it.minStockLevel ?? 0);
      if (min <= 0) continue;
      const cur = totalsByItem.get(it.id) ?? 0;
      if (cur < min) lowStockItems++;
    }

    const pendingApprovals =
      pendingPRs + pendingPOs + pendingIndents + pendingDPRs + pendingGRNs + pendingWOs;

    const kpis = {
      activeProjects,
      pendingApprovals,
      openPOs,
      lowStockItems,
      grnThisMonth,
      issuesThisMonth,
      activeWOs,
      pendingDPRApproval: pendingDPRs,
    };

    const prs = (recentPRsRaw as any[]).map((pr) => ({
      id: pr.id,
      number: pr.prNumber,
      project: pr.project?.name ?? "",
      date:
        pr.requestDate?.toISOString?.() ??
        pr.createdAt?.toISOString?.() ??
        "",
      status: pr.status,
    }));

    const pos = (recentPOsRaw as any[]).map((po) => ({
      id: po.id,
      number: po.poNumber,
      vendor: po.vendor?.name ?? "",
      project: po.project?.name ?? "",
      amount: Number(po.totalAmount ?? 0),
      status: po.status,
    }));

    return NextResponse.json({
      kpis,
      recentActivity: { prs, pos },
    });

  } catch (err: unknown) {
    const e = err as { message?: string };
    console.error("[dashboard.GET] failed:", err);
    return NextResponse.json(
      { ok: false, error: e.message ?? "Internal error" },
      { status: 500 },
    );
  }
}
