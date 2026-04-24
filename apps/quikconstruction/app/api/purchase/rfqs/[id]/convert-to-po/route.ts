import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { z } from "zod";

const withTenantAuth = withTenantAuthForModule("purchase");

const convertSchema = z.object({
  poNumber: z.string().min(1).max(50),
  poDate: z.string().min(1),
  deliveryDate: z.string().optional().nullable(),
  deliveryLocationId: z.string().optional().nullable(),
  paymentTermsDays: z.number().int().min(0).max(365).optional().nullable(),
  /** Per-RFQ-line final rate (user enters based on awarded vendor's quote). */
  lineRates: z.array(z.object({
    rfqLineId: z.string().min(1),
    unitRate: z.number().min(0),
    gstRate: z.number().min(0).max(100).optional().nullable(),
  })).min(1),
});

/**
 * POST /api/purchase/rfqs/[id]/convert-to-po
 *
 * Creates a PO from the awarded vendor on this RFQ. Copies RFQ lines →
 * PO lines using the `lineRates` array to set unit rate + GST. Flips RFQ
 * status to keep history, doesn't delete. Atomic.
 */
export const POST = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, req, { params }) => {
  const rfq = await db.cnRFQ.findFirst({
    where: { id: params.id, tenantId, deletedAt: null },
    include: {
      lines: true,
      vendors: true,
    },
  });
  if (!rfq) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (rfq.status !== "awarded") {
    return NextResponse.json(
      { success: false, error: "Only awarded RFQs can be converted. Use /award first." },
      { status: 400 },
    );
  }
  const awarded = rfq.vendors.find((v) => v.isAwarded);
  if (!awarded) {
    return NextResponse.json(
      { success: false, error: "No awarded vendor on this RFQ (data inconsistency)" },
      { status: 400 },
    );
  }

  const body = await req.json();
  const input = convertSchema.parse(body);

  // Map rfqLineId → rate/gst
  const rateByLineId = new Map(input.lineRates.map((r) => [r.rfqLineId, r]));
  const missing = rfq.lines.filter((l) => !rateByLineId.has(l.id));
  if (missing.length) {
    return NextResponse.json(
      { success: false, error: `Missing rates for ${missing.length} RFQ line(s)` },
      { status: 400 },
    );
  }

  const dup = await db.cnPurchaseOrder.findFirst({
    where: { tenantId, poNumber: input.poNumber, deletedAt: null },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json(
      { success: false, error: `PO number '${input.poNumber}' already exists` },
      { status: 409 },
    );
  }

  const po = await db.$transaction(async (tx) => {
    let subtotal = 0;
    let taxAmount = 0;
    const poLines = rfq.lines.map((rl) => {
      const r = rateByLineId.get(rl.id)!;
      const orderedQty = Number(rl.quantity);
      const unitRate = r.unitRate;
      const amount = orderedQty * unitRate;
      const gstRate = r.gstRate ?? null;
      const tax = gstRate ? amount * (gstRate / 100) : 0;
      subtotal += amount;
      taxAmount += tax;
      return {
        itemId: rl.itemId,
        orderedQty,
        pendingQty: orderedQty,
        unitRate,
        amount,
        gstRate,
        taxAmount: tax,
        totalAmount: amount + tax,
        uomId: rl.uomId,
      };
    });

    const created = await tx.cnPurchaseOrder.create({
      data: {
        tenantId,
        poNumber: input.poNumber,
        projectId: rfq.projectId,
        vendorId: awarded.vendorId,
        poDate: new Date(input.poDate),
        deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
        deliveryLocationId: input.deliveryLocationId ?? null,
        paymentTermsDays: input.paymentTermsDays ?? null,
        subtotal,
        taxAmount,
        totalAmount: subtotal + taxAmount,
        status: "draft",
        createdBy: userId,
        lines: { create: poLines },
      },
      include: { lines: true },
    });

    return created;
  });

  return NextResponse.json({ success: true, data: po }, { status: 201 });
});
