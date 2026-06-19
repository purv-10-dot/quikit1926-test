import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("reports");

/**
 * GET /api/reports/vendor-performance
 *
 * Per vendor:
 *   - totalPoAmount, totalGrnAmount (billed vs received)
 *   - grnOnTimePct — GRN date <= PO deliveryDate
 *   - qualityAcceptPct — accepted GRN lines / total GRN lines
 */
export const GET = withOrgAuth(async ({ orgId }) => {
  const vendors = await db.cnVendor.findMany({
    where: { orgId },
    select: { id: true, code: true, name: true, rating: true },
  });

  const [pos, grns, grnLines] = await Promise.all([
    db.cnPurchaseOrder.findMany({ where: { orgId }, select: { vendorId: true, totalAmount: true, deliveryDate: true, id: true, grns: { select: { id: true, grnDate: true } } } }),
    db.cnGoodsReceiptNote.findMany({ where: { orgId, status: "posted" }, select: { vendorId: true, poId: true, grnDate: true, lines: { select: { amount: true, qualityStatus: true } } } }),
    db.cnGRNLine.findMany({
      where: { grn: { orgId, status: "posted" } },
      select: { qualityStatus: true, grn: { select: { vendorId: true } } },
    }),
  ]);

  const rows = vendors.map(v => {
    const vPos = pos.filter(p => p.vendorId === v.id);
    const vGrns = grns.filter(g => g.vendorId === v.id);
    const vLines = grnLines.filter(l => l.grn.vendorId === v.id);
    const totalPoAmount = vPos.reduce((s, p) => s + Number(p.totalAmount), 0);
    const totalGrnAmount = vGrns.reduce((s, g) => s + g.lines.reduce((s2, l) => s2 + Number(l.amount), 0), 0);
    let onTime = 0, lateOrUnknown = 0;
    for (const g of vGrns) {
      const po = vPos.find(p => p.id === g.poId);
      if (po?.deliveryDate) {
        if (g.grnDate <= po.deliveryDate) onTime += 1; else lateOrUnknown += 1;
      } else lateOrUnknown += 1;
    }
    const grnOnTimePct = vGrns.length > 0 ? (onTime / vGrns.length) * 100 : null;
    const accepted = vLines.filter(l => l.qualityStatus === "accepted").length;
    const qualityAcceptPct = vLines.length > 0 ? (accepted / vLines.length) * 100 : null;
    return {
      vendorId: v.id, code: v.code, name: v.name, rating: v.rating,
      poCount: vPos.length, grnCount: vGrns.length,
      totalPoAmount, totalGrnAmount,
      grnOnTimePct, qualityAcceptPct,
    };
  }).filter(r => r.poCount > 0 || r.grnCount > 0);

  return NextResponse.json({ success: true, data: rows });
});
