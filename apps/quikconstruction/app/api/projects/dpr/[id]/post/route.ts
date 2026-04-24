import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { logAudit } from "@/lib/audit";

const withTenantAuth = withTenantAuthForModule("projects");

/**
 * POST /api/projects/dpr/[id]/post
 *
 * Locks the DPR and writes stock ledger `dpr_consumption` qtyOut rows for
 * each material consumed. Mirrors the GRN/MaterialIssue post pattern:
 *   1. Pre-check balance at (projectId, consumptionLocationId, itemId)
 *   2. Snapshot moving-avg unit rate from prior ledger
 *   3. $transaction: write ledger rows + set status=posted + postedAt/postedBy
 *
 * If materials is empty, this is still a valid "lock" operation — it seals
 * the labour/activity log but writes no stock rows.
 */
export const POST = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, _req, { params }) => {
  const dpr = await db.cnDPR.findFirst({
    where: { id: params.id, tenantId, deletedAt: null },
    include: { materials: true, project: { select: { id: true } } },
  });
  if (!dpr) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (dpr.status === "posted") return NextResponse.json({ success: false, error: "DPR is already posted" }, { status: 409 });

  if (dpr.materials.length > 0 && !dpr.consumptionLocationId) {
    return NextResponse.json({ success: false, error: "Pick a consumption location before posting materials" }, { status: 400 });
  }

  // Pre-check balance + snapshot unit rate per item at this location
  const insufficient: Array<{ itemId: string; available: number; requested: number }> = [];
  const rateSnapshots = new Map<string, { unitRate: number; amount: number }>();

  for (const m of dpr.materials) {
    const agg = await db.cnStockLedger.aggregate({
      where: {
        tenantId,
        projectId: dpr.projectId,
        locationId: dpr.consumptionLocationId!,
        itemId: m.itemId,
      },
      _sum: { qtyIn: true, qtyOut: true, amount: true },
    });
    const available = Number(agg._sum.qtyIn ?? 0) - Number(agg._sum.qtyOut ?? 0);
    if (available < Number(m.quantity)) {
      insufficient.push({ itemId: m.itemId, available, requested: Number(m.quantity) });
      continue;
    }
    // Moving avg rate = total inventory value / total inventory qty at this location
    // Simplified: latest inbound rate would also work. Use total-value / qty-in approximation.
    const avgAgg = await db.cnStockLedger.aggregate({
      where: { tenantId, projectId: dpr.projectId, locationId: dpr.consumptionLocationId!, itemId: m.itemId, qtyIn: { gt: 0 } },
      _sum: { qtyIn: true, amount: true },
    });
    const totalIn = Number(avgAgg._sum.qtyIn ?? 0);
    const totalVal = Number(avgAgg._sum.amount ?? 0);
    const unitRate = totalIn > 0 ? totalVal / totalIn : 0;
    const amount = unitRate * Number(m.quantity);
    rateSnapshots.set(m.id, { unitRate, amount });
  }

  if (insufficient.length > 0) {
    return NextResponse.json({ success: false, error: "Insufficient stock", details: insufficient }, { status: 400 });
  }

  const postedAt = new Date();
  try {
    await db.$transaction(async (tx) => {
      for (const m of dpr.materials) {
        const snap = rateSnapshots.get(m.id)!;
        await tx.cnDPRMaterial.update({
          where: { id: m.id },
          data: { unitRate: snap.unitRate, amount: snap.amount },
        });
        await tx.cnStockLedger.create({
          data: {
            tenantId,
            projectId: dpr.projectId,
            locationId: dpr.consumptionLocationId!,
            itemId: m.itemId,
            transactionType: "dpr_consumption",
            transactionRefId: dpr.id,
            transactionRefNumber: `DPR-${dpr.dprDate.toISOString().slice(0, 10)}`,
            transactionDate: dpr.dprDate,
            qtyIn: 0,
            qtyOut: m.quantity,
            unitRate: snap.unitRate,
            amount: snap.amount,
            uomId: m.uomId,
            createdBy: userId,
          },
        });
      }
      await tx.cnDPR.update({
        where: { id: dpr.id },
        data: { status: "posted", postedAt, postedBy: userId, updatedBy: userId },
      });
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Posting failed";
    return NextResponse.json({ success: false, error: `Transaction failed: ${msg}` }, { status: 500 });
  }

  await logAudit({ tenantId, userId, actionType: "post", entityType: "cnDPR", entityId: dpr.id, oldValues: { status: "draft" }, newValues: { status: "posted", materialsPosted: dpr.materials.length } });
  return NextResponse.json({ success: true, data: { id: dpr.id, status: "posted", postedAt, materialsPosted: dpr.materials.length } });
});
