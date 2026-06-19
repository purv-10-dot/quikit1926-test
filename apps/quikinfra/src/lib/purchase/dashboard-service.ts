/**
 * PurchaseDashboardService — Real data KPI queries
 *
 * All widgets query persisted data using canonical enums.
 * No hardcoded dummy values.
 */

import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/auth/context";
import { MRStatus, IndentStatus, POStatus, GRNStatus } from "./enums";
import { stockService } from "./stock-service";

function tenantWhere(ctx?: TenantContext | null): Record<string, unknown> {
  if (!ctx) return {};
  return { orgId: ctx.orgId };
}

export class PurchaseDashboardService {
  /** Widget 1: Pending approvals queue — role-aware, with aging buckets.
   *  Sourced from `cn_approval_instances` (Prisma). All entity types
   *  (MR/Indent/PO/GRN/etc.) create instance rows here on submit, so this
   *  is the single source of truth for the queue. */
  async getPendingApprovals(ctx?: TenantContext | null) {
    const approvals = await db.cnApprovalInstance.findMany({
      where: { ...tenantWhere(ctx), status: "pending_approval" },
      orderBy: { requestedAt: "desc" },
    });

    const now = Date.now();
    const bucket = (date: Date | string) => {
      const t = typeof date === "string" ? new Date(date).getTime() : date.getTime();
      const days = Math.floor((now - t) / 86400000);
      if (days <= 1) return "today";
      if (days <= 2) return "1-2 days";
      if (days <= 5) return "3-5 days";
      return ">5 days";
    };

    return {
      total: approvals.length,
      byType: {
        mr: approvals.filter((a) => a.entityType === "purchase_requisitions").length,
        indent: approvals.filter((a) => a.entityType === "purchase_indents").length,
        po: approvals.filter((a) => a.entityType === "purchase_order").length,
        grn: approvals.filter((a) => a.entityType === "grn").length,
      },
      aging: approvals.map((a) => ({
        id: a.id,
        type: a.entityType,
        number: a.entityNumber,
        bucket: bucket(a.requestedAt),
      })),
    };
  }

  /** Widget 2: MR status summary */
  async getMRSummary(ctx?: TenantContext | null) {
    const where = tenantWhere(ctx);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const [grouped, total, todayMRs] = await Promise.all([
      db.cnPurchaseRequisition.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
      db.cnPurchaseRequisition.count({ where }),
      db.cnPurchaseRequisition.count({
        where: { ...where, requestDate: { gte: startOfDay, lt: endOfDay } },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const row of grouped) counts[row.status] = row._count?._all ?? 0;

    return {
      total,
      todayMRs,
      pendingApproval: (counts[MRStatus.SUBMITTED] ?? 0) + (counts["pending_approval"] ?? 0),
      approvedPendingIndent: counts[MRStatus.APPROVED_FOR_INDENT] ?? 0,
      stockServed: counts[MRStatus.APPROVED_FOR_STOCK_ISSUE] ?? 0,
      fullyServed: counts[MRStatus.FULLY_SERVED] ?? 0,
      rejected: counts[MRStatus.REJECTED] ?? 0,
    };
  }

  /** Widget 3: Indent pipeline funnel */
  async getIndentPipeline(ctx?: TenantContext | null) {
    const where = tenantWhere(ctx);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfNextMonth = new Date(startOfMonth);
    startOfNextMonth.setMonth(startOfNextMonth.getMonth() + 1);

    const [grouped, totalThisMonth] = await Promise.all([
      db.cnPurchaseIndent.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
      db.cnPurchaseIndent.count({
        where: { ...where, indentDate: { gte: startOfMonth, lt: startOfNextMonth } },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const row of grouped) counts[row.status] = row._count?._all ?? 0;

    return {
      totalThisMonth,
      submitted: counts[IndentStatus.SUBMITTED_L1] ?? 0,
      l2Approved: counts[IndentStatus.APPROVED_L2] ?? 0,
      l3Approved:
        (counts[IndentStatus.APPROVED_L3] ?? 0) +
        (counts["l3_approved"] ?? 0) +
        (counts["approved"] ?? 0),
      poCreated:
        (counts[IndentStatus.PARTIALLY_PO_CREATED] ?? 0) +
        (counts[IndentStatus.FULLY_PO_CREATED] ?? 0),
      closed: counts[IndentStatus.CLOSED] ?? 0,
    };
  }

  /** Widget 4: POs due for delivery — with aging bands */
  async getPODeliveryTracking(ctx?: TenantContext | null) {
    const allPos = await db.cnPurchaseOrder.findMany({
      where: tenantWhere(ctx),
    });
    const pos = allPos.filter((po) =>
      ([POStatus.APPROVED, POStatus.DISPATCHED, POStatus.PARTIALLY_RECEIVED] as string[]).includes(po.status),
    );

    const now = new Date();
    const daysDiff = (dateStr: Date | string | null | undefined) => {
      if (!dateStr) return null;
      const t = typeof dateStr === "string" ? new Date(dateStr).getTime() : dateStr.getTime?.();
      if (!t || Number.isNaN(t)) return null;
      return Math.floor((t - now.getTime()) / 86400000);
    };

    return {
      overdue: pos.filter((po) => { const d = daysDiff(po.deliveryDate); return d !== null && d < 0; }).length,
      today: pos.filter((po) => { const d = daysDiff(po.deliveryDate); return d === 0; }).length,
      next7Days: pos.filter((po) => { const d = daysDiff(po.deliveryDate); return d !== null && d > 0 && d <= 7; }).length,
      next14Days: pos.filter((po) => { const d = daysDiff(po.deliveryDate); return d !== null && d > 7 && d <= 14; }).length,
      total: pos.length,
      totalValue: pos.reduce((s: number, po) => s + (parseFloat(po.totalAmount?.toString?.() ?? "0")), 0),
    };
  }

  /** Widget 5: PO commitment vs budget per project */
  async getPOCommitmentVsBudget(ctx?: TenantContext | null) {
    const where = tenantWhere(ctx);
    const [projects, pos, grns] = await Promise.all([
      db.cnProject.findMany({ where }),
      db.cnPurchaseOrder.findMany({ where }),
      db.cnGoodsReceiptNote.findMany({ where, include: { lines: true } }),
    ]);

    return projects.map((proj) => {
      const projectPOs = pos.filter((po) => po.projectId === proj.id && po.status !== POStatus.CANCELLED);
      const projectGRNs = grns.filter((g) => g.projectId === proj.id && g.status === GRNStatus.APPROVED);

      const budget = parseFloat(proj.projectValue?.toString?.() ?? proj.budget?.toString?.() ?? "0");
      const poCommitted = projectPOs.reduce((s: number, po) => s + parseFloat(po.totalAmount?.toString?.() ?? "0"), 0);
      const grnReceived = projectGRNs.reduce(
        (s: number, g) =>
          s + (g.lines ?? []).reduce((ls: number, l) => ls + parseFloat(l.amount?.toString?.() ?? "0"), 0),
        0,
      );

      return {
        projectId: proj.id, projectCode: proj.code, projectName: proj.name,
        budget: Math.round(budget),
        poCommitted: Math.round(poCommitted),
        grnReceived: Math.round(grnReceived),
        balance: Math.round(budget - poCommitted),
        utilizationPct: budget > 0 ? Math.round(poCommitted / budget * 100) : 0,
      };
    });
  }

  /** Widget 6: GRN pending approval with aging */
  async getGRNPendingApproval(ctx?: TenantContext | null) {
    const grnWhere = {
      ...tenantWhere(ctx),
      status: { in: [GRNStatus.DRAFT, GRNStatus.PENDING_APPROVAL] },
    };
    const [count, lineAgg] = await Promise.all([
      db.cnGoodsReceiptNote.count({ where: grnWhere }),
      db.cnGRNLine.aggregate({
        where: { grn: grnWhere },
        _sum: { amount: true },
      }),
    ]);
    return {
      total: count,
      totalValue: parseFloat(lineAgg._sum?.amount?.toString?.() ?? "0"),
    };
  }

  /** Widget 7: Vendor delivery performance */
  async getVendorPerformance(ctx?: TenantContext | null) {
    const where = tenantWhere(ctx);
    const [allPos, allGrns] = await Promise.all([
      db.cnPurchaseOrder.findMany({ where, include: { lines: true, vendor: true } }),
      db.cnGoodsReceiptNote.findMany({ where, include: { lines: true, po: true } }),
    ]);
    const pos = allPos.filter((po) => po.status !== POStatus.DRAFT && po.status !== POStatus.CANCELLED);
    const grns = allGrns.filter((g) => g.status === GRNStatus.APPROVED);

    // Group by vendor
    const vendorMap = new Map<string, { name: string; totalPOs: number; totalValue: number; onTime: number; late: number; totalAccepted: number; totalRejected: number }>();

    for (const po of pos) {
      const vid = po.vendorId ?? "";
      if (!vendorMap.has(vid)) vendorMap.set(vid, { name: po.vendor?.name ?? "", totalPOs: 0, totalValue: 0, onTime: 0, late: 0, totalAccepted: 0, totalRejected: 0 });
      const v = vendorMap.get(vid)!;
      v.totalPOs++;
      v.totalValue += parseFloat(po.totalAmount?.toString?.() ?? "0");
    }

    for (const grn of grns) {
      const vid = grn.vendorId ?? "";
      const v = vendorMap.get(vid);
      if (!v) continue;
      const isLate = grn.po?.deliveryDate ? new Date(grn.grnDate) > new Date(grn.po.deliveryDate) : false;
      if (isLate) v.late++; else v.onTime++;
      for (const line of (grn.lines ?? [])) {
        v.totalAccepted += parseFloat(line.acceptedQty?.toString?.() ?? "0");
        v.totalRejected += parseFloat(line.rejectedQty?.toString?.() ?? "0");
      }
    }

    return Array.from(vendorMap.entries()).map(([id, v]) => ({
      vendorId: id, vendorName: v.name,
      totalPOs: v.totalPOs,
      totalOrderedValue: Math.round(v.totalValue),
      onTimeDeliveryPct: (v.onTime + v.late) > 0 ? Math.round(v.onTime / (v.onTime + v.late) * 100) : 100,
      rejectionPct: (v.totalAccepted + v.totalRejected) > 0 ? Math.round(v.totalRejected / (v.totalAccepted + v.totalRejected) * 100) : 0,
    }));
  }

  /** Widget 8: Material received this month — top items */
  async getMaterialReceivedThisMonth(ctx?: TenantContext | null) {
    const all = await db.cnGoodsReceiptNote.findMany({
      where: tenantWhere(ctx),
      include: { lines: { include: { item: true } } },
    });
    const grns = all.filter((g) => g.status === GRNStatus.APPROVED);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const dateOf = (g: { grnDate?: Date | string | null }) => {
      const d = g.grnDate;
      if (!d) return "";
      if (typeof d === "string") return d;
      try { return new Date(d).toISOString(); } catch { return ""; }
    };
    const monthGRNs = grns.filter((g) => dateOf(g).startsWith(thisMonth));

    const itemMap = new Map<string, { name: string; totalQty: number; totalValue: number }>();
    for (const grn of monthGRNs) {
      for (const line of (grn.lines ?? [])) {
        const key = line.itemId ?? "";
        if (!itemMap.has(key)) itemMap.set(key, { name: line.item?.name ?? "", totalQty: 0, totalValue: 0 });
        const entry = itemMap.get(key)!;
        entry.totalQty += parseFloat(line.acceptedQty?.toString?.() ?? "0");
        entry.totalValue += parseFloat(line.amount?.toString?.() ?? "0");
      }
    }

    return Array.from(itemMap.values())
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 10);
  }

  /** Widget 9: Low stock / reorder alerts */
  getLowStockAlerts() {
    return stockService.getLowStockAlerts();
  }

  /** Full dashboard payload — widgets run in parallel; wall time = max(widget), not sum. */
  async getFullDashboard(ctx?: TenantContext | null) {
    const [
      pendingApprovals,
      mrSummary,
      indentPipeline,
      poDelivery,
      poVsBudget,
      grnPending,
      vendorPerformance,
      materialReceived,
      lowStockAlerts,
    ] = await Promise.all([
      this.getPendingApprovals(ctx),
      this.getMRSummary(ctx),
      this.getIndentPipeline(ctx),
      this.getPODeliveryTracking(ctx),
      this.getPOCommitmentVsBudget(ctx),
      this.getGRNPendingApproval(ctx),
      this.getVendorPerformance(ctx),
      this.getMaterialReceivedThisMonth(ctx),
      Promise.resolve(this.getLowStockAlerts()),
    ]);
    return {
      pendingApprovals,
      mrSummary,
      indentPipeline,
      poDelivery,
      poVsBudget,
      grnPending,
      vendorPerformance,
      materialReceived,
      lowStockAlerts,
    };
  }
}

export const dashboardService = new PurchaseDashboardService();
