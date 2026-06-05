import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { z } from "zod";

const withOrgAuth = withOrgAuthForModule("purchase");

const convertSchema = z.object({
  /** Winning vendor — must be one of the RFQ's vendor rows. The real
   *  RFQ model has no per-vendor "awarded" flag, so the caller names
   *  the awarded vendor here when converting to a PO. */
  vendorId: z.string().min(1),
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
 * Creates a PO from a chosen vendor on this RFQ. Copies RFQ lines →
 * PO lines using the `lineRates` array to set unit rate + GST, and
 * links the PO back to the RFQ via `rfqId`. The RFQ itself is left
 * intact (status untouched) to preserve history. Atomic.
 */
export const POST = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const rfq = await (db as any).cnRfq.findFirst({
    where: { id: params.id, orgId },
    include: {
      lines: true,
      vendors: true,
    },
  });
  if (!rfq || rfq.status === "inactive") {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }
  if (rfq.status === "draft") {
    return NextResponse.json(
      { success: false, error: "RFQ must be sent and quoted before it can be converted to a PO." },
      { status: 400 },
    );
  }

  const body = await req.json();
  const input = convertSchema.parse(body);

  const awarded = rfq.vendors.find((v: any) => v.vendorId === input.vendorId);
  if (!awarded) {
    return NextResponse.json(
      { success: false, error: "Chosen vendor is not on this RFQ's vendor list" },
      { status: 400 },
    );
  }

  // Map rfqLineId → rate/gst
  const rateByLineId = new Map(input.lineRates.map((r) => [r.rfqLineId, r]));
  const missing = rfq.lines.filter((l: any) => !rateByLineId.has(l.id));
  if (missing.length) {
    return NextResponse.json(
      { success: false, error: `Missing rates for ${missing.length} RFQ line(s)` },
      { status: 400 },
    );
  }
  // PO lines require a UOM; RFQ lines may carry a null uomId for legacy rows.
  const noUom = rfq.lines.filter((l: any) => !l.uomId);
  if (noUom.length) {
    return NextResponse.json(
      { success: false, error: `${noUom.length} RFQ line(s) have no unit of measure; set a UOM before converting.` },
      { status: 400 },
    );
  }

  const dup = await (db as any).cnPurchaseOrder.findFirst({
    where: { orgId, poNumber: input.poNumber },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json(
      { success: false, error: `PO number '${input.poNumber}' already exists` },
      { status: 409 },
    );
  }

  const po = await db.$transaction(async (tx: any) => {
    let subtotal = 0;
    let taxAmount = 0;
    const poLines = rfq.lines.map((rl: any) => {
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
        quantity: orderedQty,
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
        orgId,
        poNumber: input.poNumber,
        projectId: rfq.projectId,
        vendorId: awarded.vendorId,
        rfqId: rfq.id,
        poDate: new Date(input.poDate),
        deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
        deliveryLocationId: input.deliveryLocationId ?? null,
        paymentTermsDays: input.paymentTermsDays ?? null,
        subtotal,
        taxAmount,
        totalAmount: subtotal + taxAmount,
        status: "draft",
        createdBy: userId,
        updatedBy: userId,
        lines: { create: poLines },
      },
      include: { lines: true },
    });

    return created;
  });

  return NextResponse.json({ success: true, data: po }, { status: 201 });
}, { permission: { resource: "construction.po", action: "create" } });
