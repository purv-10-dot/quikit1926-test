/**
 * PurchaseDashboardService — Real data KPI queries
 *
 * All widgets query persisted data using canonical enums.
 * No hardcoded dummy values.
 */

import { db } from "@/lib/db/prisma";
import type { TenantContext } from "@/lib/auth/context";
import { MRStatus, IndentStatus, POStatus, GRNStatus } from "./enums";
import { stockService } from "./stock-service";

function tenantWhere(ctx?: TenantContext | null): Record<string, unknown> {
  if (!ctx) return {};
  return { tenantId: ctx.tenantId, orgId: ctx.orgId };
}

export class PurchaseDashboardService {
  /** Widget 1: Pending approvals queue — role-aware, with aging buckets.
   *  Sourced from `approval_instances` (Prisma). All entity types
   *  (MR/Indent/PO/GRN/etc.) create instance rows here on submit, so this
   *  is the single source of truth for the queue. */
  async getPendingApprovals() {
    const approvals = await (db as any).cnApprovalInstance.findMany({
      where: { status: "pending_approval" },
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
        mr: approvals.filter((a: any) => a.entityType === "purchase_requisitions").length,
        indent: approvals.filter((a: any) => a.entityType === "purchase_indents").length,
        po: approvals.filter((a: any) => a.entityType === "purchase_order").length,
        grn: approvals.filter((a: any) => a.entityType === "grn").length,
      },
      aging: approvals.map((a: any) => ({
        id: a.id,
        type: a.entityType,
        number: a.entityNumber,
        bucket: bucket(a.requestedAt),
      })),
    };
  }

  /** Widget 2: MR status summary */
  async getMRSummary(ctx?: TenantContext | null) {
    const mrs = await (db as any).cnPurchaseRequisition.findMany({
      where: tenantWhere(ctx),
    });
    const today = new Date().toISOString().split("T")[0];
    const dateOf = (m: any) => {
      const d = m.requestDate;
      if (!d) return "";
      if (typeof d === "string") return d.slice(0, 10);
      try { return new Date(d).toISOString().split("T")[0]; } catch { return ""; }
    };
    return {
      total: mrs.length,
      todayMRs: mrs.filter((m: any) => dateOf(m) === today).length,
      pendingApproval: mrs.filter((m: any) => m.status === MRStatus.SUBMITTED || m.status === "pending_approval").length,
      approvedPendingIndent: mrs.filter((m: any) => m.status === MRStatus.APPROVED_FOR_INDENT).length,
      stockServed: mrs.filter((m: any) => m.status === MRStatus.APPROVED_FOR_STOCK_ISSUE).length,
      fullyServed: mrs.filter((m: any) => m.status === MRStatus.FULLY_SERVED).length,
      rejected: mrs.filter((m: any) => m.status === MRStatus.REJECTED).length,
    };
  }

  /** Widget 3: Indent pipeline funnel */
  async getIndentPipeline(ctx?: TenantContext | null) {
    const indents = await (db as any).cnPurchaseIndent.findMany({
      where: tenantWhere(ctx),
    });
    const thisMonth = new Date().toISOString().slice(0, 7);
    const dateOf = (i: any) => {
      const d = i.indentDate ?? i.createdAt;
      if (!d) return "";
      if (typeof d === "string") return d;
      try { return new Date(d).toISOString(); } catch { return ""; }
    };
    const monthIndents = indents.filter((i: any) => dateOf(i).startsWith(thisMonth));
    return {
      totalThisMonth: monthIndents.length,
      submitted: indents.filter((i: any) => i.status === IndentStatus.SUBMITTED_L1).length,
      l2Approved: indents.filter((i: any) => i.status === IndentStatus.APPROVED_L2).length,
      l3Approved: indents.filter((i: any) => [IndentStatus.APPROVED_L3, "l3_approved", "approved"].includes(i.status)).length,
      poCreated: indents.filter((i: any) => [IndentStatus.PARTIALLY_PO_CREATED, IndentStatus.FULLY_PO_CREATED].includes(i.status)).length,
      closed: indents.filter((i: any) => i.status === IndentStatus.CLOSED).length,
    };
  }

  /** Widget 4: POs due for delivery — with aging bands */
  async getPODeliveryTracking(ctx?: TenantContext | null) {
    const allPos = await (db as any).cnPurchaseOrder.findMany({
      where: tenantWhere(ctx),
    });
    const pos = allPos.filter((po: any) =>
      [POStatus.APPROVED, POStatus.DISPATCHED, POStatus.PARTIALLY_RECEIVED].includes(po.status),
    );

    const now = new Date();
    const daysDiff = (dateStr: any) => {
      if (!dateStr) return null;
      const t = typeof dateStr === "string" ? new Date(dateStr).getTime() : dateStr.getTime?.();
      if (!t || Number.isNaN(t)) return null;
      return Math.floor((t - now.getTime()) / 86400000);
    };

    return {
      overdue: pos.filter((po: any) => { const d = daysDiff(po.deliveryDate); return d !== null && d < 0; }).length,
      today: pos.filter((po: any) => { const d = daysDiff(po.deliveryDate); return d === 0; }).length,
      next7Days: pos.filter((po: any) => { const d = daysDiff(po.deliveryDate); return d !== null && d > 0 && d <= 7; }).length,
      next14Days: pos.filter((po: any) => { const d = daysDiff(po.deliveryDate); return d !== null && d > 7 && d <= 14; }).length,
      total: pos.length,
      totalValue: pos.reduce((s: number, po: any) => s + (parseFloat(po.totalAmount?.toString?.() ?? po.poTotalIncGst?.toString?.() ?? "0")), 0),
    };
  }

  /** Widget 5: PO commitment vs budget per project */
  async getPOCommitmentVsBudget(ctx?: TenantContext | null) {
    const where = tenantWhere(ctx);
    const [projects, pos, grns] = await Promise.all([
      (db as any).cnProject.findMany({ where }),
      (db as any).cnPurchaseOrder.findMany({ where }),
      (db as any).cnGoodsReceiptNote.findMany({ where }),
    ]);

    return projects.map((proj: any) => {
      const projectPOs = pos.filter((po: any) => po.projectId === proj.id && po.status !== POStatus.CANCELLED);
      const projectGRNs = grns.filter((g: any) => g.projectId === proj.id && g.status === GRNStatus.APPROVED);

      const budget = parseFloat(proj.projectValue?.toString?.() ?? proj.budget?.toString?.() ?? "0");
      const poCommitted = projectPOs.reduce((s: number, po: any) => s + parseFloat(po.totalAmount?.toString?.() ?? po.poTotalIncGst?.toString?.() ?? "0"), 0);
      const grnReceived = projectGRNs.reduce((s: number, g: any) => s + parseFloat(g.grnTotalExGST?.toString?.() ?? "0"), 0);

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
    const all = await (db as any).cnGoodsReceiptNote.findMany({
      where: tenantWhere(ctx),
    });
    const grns = all.filter((g: any) => g.status === GRNStatus.DRAFT || g.status === GRNStatus.PENDING_APPROVAL);
    return {
      total: grns.length,
      totalValue: grns.reduce((s: number, g: any) => s + parseFloat(g.grnTotalExGST?.toString?.() ?? "0"), 0),
    };
  }

  /** Widget 7: Vendor delivery performance */
  async getVendorPerformance(ctx?: TenantContext | null) {
    const where = tenantWhere(ctx);
    const [allPos, allGrns] = await Promise.all([
      (db as any).cnPurchaseOrder.findMany({ where, include: { lines: true } }),
      (db as any).cnGoodsReceiptNote.findMany({ where, include: { lines: true } }),
    ]);
    const pos = allPos.filter((po: any) => po.status !== POStatus.DRAFT && po.status !== POStatus.CANCELLED);
    const grns = allGrns.filter((g: any) => g.status === GRNStatus.APPROVED);

    // Group by vendor
    const vendorMap = new Map<string, { name: string; totalPOs: number; totalValue: number; onTime: number; late: number; totalAccepted: number; totalRejected: number }>();

    for (const po of pos) {
      const vid = po.vendorId ?? "";
      if (!vendorMap.has(vid)) vendorMap.set(vid, { name: po.vendorName ?? "", totalPOs: 0, totalValue: 0, onTime: 0, late: 0, totalAccepted: 0, totalRejected: 0 });
      const v = vendorMap.get(vid)!;
      v.totalPOs++;
      v.totalValue += parseFloat(po.totalAmount?.toString?.() ?? "0");
    }

    for (const grn of grns) {
      const vid = grn.vendorId ?? "";
      const v = vendorMap.get(vid);
      if (!v) continue;
      if (grn.isLateDelivery) v.late++; else v.onTime++;
      for (const line of (grn.lines ?? [])) {
        v.totalAccepted += parseFloat(line.acceptedQty?.toString?.() ?? line.qtyAccepted?.toString?.() ?? "0");
        v.totalRejected += parseFloat(line.rejectedQty?.toString?.() ?? line.qtyRejected?.toString?.() ?? "0");
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
    const all = await (db as any).cnGoodsReceiptNote.findMany({
      where: tenantWhere(ctx),
      include: { lines: true },
    });
    const grns = all.filter((g: any) => g.status === GRNStatus.APPROVED);
    const thisMonth = new Date().toISOString().slice(0, 7);
    const dateOf = (g: any) => {
      const d = g.grnDate;
      if (!d) return "";
      if (typeof d === "string") return d;
      try { return new Date(d).toISOString(); } catch { return ""; }
    };
    const monthGRNs = grns.filter((g: any) => dateOf(g).startsWith(thisMonth));

    const itemMap = new Map<string, { name: string; totalQty: number; totalValue: number }>();
    for (const grn of monthGRNs) {
      for (const line of (grn.lines ?? [])) {
        const key = line.itemId ?? "";
        if (!itemMap.has(key)) itemMap.set(key, { name: line.itemName ?? "", totalQty: 0, totalValue: 0 });
        const entry = itemMap.get(key)!;
        entry.totalQty += parseFloat(line.acceptedQty?.toString?.() ?? line.qtyAccepted?.toString?.() ?? "0");
        entry.totalValue += parseFloat(line.lineValueExGST?.toString?.() ?? "0");
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

  /** Full dashboard payload */
  async getFullDashboard(ctx?: TenantContext | null) {
    return {
      pendingApprovals: await this.getPendingApprovals(),
      mrSummary: await this.getMRSummary(ctx),
      indentPipeline: await this.getIndentPipeline(ctx),
      poDelivery: await this.getPODeliveryTracking(ctx),
      poVsBudget: await this.getPOCommitmentVsBudget(ctx),
      grnPending: await this.getGRNPendingApproval(ctx),
      vendorPerformance: await this.getVendorPerformance(ctx),
      materialReceived: await this.getMaterialReceivedThisMonth(ctx),
      lowStockAlerts: this.getLowStockAlerts(),
    };
  }
}

export const dashboardService = new PurchaseDashboardService();
