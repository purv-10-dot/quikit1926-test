import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("dashboard");

/**
 * GET /api/dashboard — single rollup for the landing page.
 *
 * Returns:
 *   kpis       : active project count, revenue MTD, AR/AP outstanding + overdue
 *   activity   : counts of open PRs, recent GRNs, DPRs this week, open incidents
 *   overdue    : top 5 overdue invoices + top 5 overdue bills
 *   recentDprs : last 5 posted/submitted DPRs
 *   recentRabs : last 5 RABs across statuses
 *   incidents  : 5 most-recent open safety incidents
 *   stockLow   : 10 lowest positive balances (as-of now) across project/location/item
 */
export const GET = withTenantAuth(async ({ orgId }) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 7);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    activeProjects,
    mtdInvoices,
    allInvoices,
    allBills,
    openPrs,
    monthGrnCount,
    weekDprCount,
    openIncidentCount,
    recentDprs,
    recentRabs,
    openIncidents,
  ] = await Promise.all([
    db.cnProject.count({ where: { orgId, deletedAt: null, status: "active" } }),
    db.cnClientInvoice.aggregate({
      where: { orgId, deletedAt: null, status: { not: "cancelled" }, invoiceDate: { gte: monthStart } },
      _sum: { total: true },
    }),
    db.cnClientInvoice.findMany({
      where: { orgId, deletedAt: null, status: { not: "cancelled" } },
      select: { id: true, invoiceNumber: true, total: true, paidAmount: true, dueDate: true, invoiceDate: true, status: true, customer: { select: { name: true } } },
    }),
    db.cnVendorBill.findMany({
      where: { orgId, deletedAt: null, status: { not: "cancelled" } },
      select: { id: true, billNumber: true, total: true, paidAmount: true, dueDate: true, billDate: true, status: true, vendor: { select: { name: true } } },
    }),
    db.cnPurchaseRequisition.count({ where: { orgId, deletedAt: null, status: { in: ["draft", "submitted"] } } }),
    db.cnGoodsReceiptNote.count({ where: { orgId, deletedAt: null, grnDate: { gte: monthStart } } }),
    db.cnDPR.count({ where: { orgId, deletedAt: null, dprDate: { gte: weekStart } } }),
    db.cnSafetyIncident.count({ where: { orgId, deletedAt: null, status: { in: ["open", "investigating"] } } }),
    db.cnDPR.findMany({
      where: { orgId, deletedAt: null },
      select: { id: true, dprDate: true, status: true, project: { select: { name: true, code: true } }, _count: { select: { lines: true, materials: true } } },
      orderBy: { dprDate: "desc" },
      take: 5,
    }),
    db.cnRAB.findMany({
      where: { orgId, deletedAt: null },
      select: { id: true, rabNumber: true, rabDate: true, status: true, total: true, project: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.cnSafetyIncident.findMany({
      where: { orgId, deletedAt: null, status: { in: ["open", "investigating"] } },
      select: { id: true, incidentNumber: true, incidentDate: true, severity: true, category: true, title: true, project: { select: { name: true } } },
      orderBy: { incidentDate: "desc" },
      take: 5,
    }),
  ]);

  // AR / AP aggregates
  const arTotal = allInvoices.reduce((s, i) => s + (Number(i.total) - Number(i.paidAmount)), 0);
  const arOverdueRows = allInvoices
    .map(i => {
      const out = Number(i.total) - Number(i.paidAmount);
      if (out <= 0.01) return null;
      const ref = i.dueDate ?? i.invoiceDate;
      const days = Math.floor((today.getTime() - ref.getTime()) / 86400000);
      if (days <= 0) return null;
      return { id: i.id, ref: i.invoiceNumber, party: i.customer?.name ?? "—", days, outstanding: out };
    })
    .filter(Boolean) as Array<{ id: string; ref: string; party: string; days: number; outstanding: number }>;
  const arOverdue = arOverdueRows.reduce((s, r) => s + r.outstanding, 0);

  const apTotal = allBills.reduce((s, b) => s + (Number(b.total) - Number(b.paidAmount)), 0);
  const apOverdueRows = allBills
    .map(b => {
      const out = Number(b.total) - Number(b.paidAmount);
      if (out <= 0.01) return null;
      const ref = b.dueDate ?? b.billDate;
      const days = Math.floor((today.getTime() - ref.getTime()) / 86400000);
      if (days <= 0) return null;
      return { id: b.id, ref: b.billNumber, party: b.vendor?.name ?? "—", days, outstanding: out };
    })
    .filter(Boolean) as Array<{ id: string; ref: string; party: string; days: number; outstanding: number }>;
  const apOverdue = apOverdueRows.reduce((s, r) => s + r.outstanding, 0);

  // Stock low-balance — per (project, location, item) compute running balance, show lowest 10 positive
  const ledger = await db.cnStockLedger.groupBy({
    by: ["projectId", "locationId", "itemId"],
    where: { orgId },
    _sum: { qtyIn: true, qtyOut: true },
  });
  const positive = ledger.map(r => ({
    projectId: r.projectId, locationId: r.locationId, itemId: r.itemId,
    qty: Number(r._sum.qtyIn ?? 0) - Number(r._sum.qtyOut ?? 0),
  })).filter(r => r.qty > 0).sort((a, b) => a.qty - b.qty).slice(0, 10);

  const projIds = Array.from(new Set(positive.map(p => p.projectId)));
  const locIds = Array.from(new Set(positive.map(p => p.locationId)));
  const itmIds = Array.from(new Set(positive.map(p => p.itemId)));
  const [projs, locs, items] = await Promise.all([
    db.cnProject.findMany({ where: { id: { in: projIds } }, select: { id: true, name: true, code: true } }),
    db.cnLocation.findMany({ where: { id: { in: locIds } }, select: { id: true, name: true } }),
    db.cnItem.findMany({ where: { id: { in: itmIds } }, select: { id: true, code: true, name: true } }),
  ]);
  const stockLow = positive.map(p => ({
    qty: p.qty,
    project: projs.find(x => x.id === p.projectId)?.name ?? "—",
    location: locs.find(x => x.id === p.locationId)?.name ?? "—",
    itemCode: items.find(x => x.id === p.itemId)?.code ?? "—",
    itemName: items.find(x => x.id === p.itemId)?.name ?? "—",
  }));

  return NextResponse.json({
    success: true,
    data: {
      kpis: {
        activeProjects,
        revenueMtd: Number(mtdInvoices._sum.total ?? 0),
        arTotal, arOverdue,
        apTotal, apOverdue,
      },
      activity: {
        openPrs,
        monthGrnCount,
        weekDprCount,
        openIncidentCount,
      },
      overdue: {
        invoices: arOverdueRows.sort((a, b) => b.days - a.days).slice(0, 5),
        bills: apOverdueRows.sort((a, b) => b.days - a.days).slice(0, 5),
      },
      recentDprs,
      recentRabs,
      incidents: openIncidents,
      stockLow,
    },
  });
});
