import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { grnCreateSchema } from "@/lib/schemas/procurement";

const withTenantAuth = withTenantAuthForModule("store");

export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const poId = req.nextUrl.searchParams.get("poId") || undefined;
  const grns = await db.cnGoodsReceiptNote.findMany({
    where: {
      tenantId,
      deletedAt: includeDeleted ? { not: null } : null,
      ...(status ? { status } : {}),
      ...(poId ? { poId } : {}),
    },
    include: {
      po: { select: { id: true, poNumber: true } },
      project: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
    orderBy: { grnDate: "desc" },
  });
  return NextResponse.json({ success: true, data: grns });
});

/**
 * POST /api/store/grn — create GRN as DRAFT.
 *
 * IMPORTANT: Creating a GRN does NOT write to the stock ledger. Only posting
 * the GRN via /api/store/grn/[id]/post writes ledger rows. This separation
 * lets users review a receipt before it becomes part of inventory truth —
 * typos in qty/rate can be fixed while draft, but once posted the GRN is
 * immutable and the ledger row is created.
 */
export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const body = await req.json();
  const input = grnCreateSchema.parse(body);

  // Validate FKs + PO status
  const po = await db.cnPurchaseOrder.findFirst({
    where: { id: input.poId, tenantId, deletedAt: null },
    select: { id: true, status: true, vendorId: true, projectId: true, lines: { select: { id: true, orderedQty: true, receivedQty: true, pendingQty: true, itemId: true } } },
  });
  if (!po) return NextResponse.json({ success: false, error: "PO not found" }, { status: 400 });
  if (po.vendorId !== input.vendorId) {
    return NextResponse.json(
      { success: false, error: "Vendor does not match the PO's vendor" },
      { status: 400 },
    );
  }
  if (po.projectId !== input.projectId) {
    return NextResponse.json(
      { success: false, error: "Project does not match the PO's project" },
      { status: 400 },
    );
  }
  if (!["sent", "partially_received"].includes(po.status)) {
    return NextResponse.json(
      { success: false, error: `Cannot GRN a PO in status '${po.status}'. Send it first.` },
      { status: 400 },
    );
  }

  // Per-line pending qty validation
  const errors: string[] = [];
  for (const l of input.lines) {
    if (l.acceptedQty + l.rejectedQty > l.receivedQty) {
      errors.push(`Line for item ${l.itemId}: accepted+rejected > received`);
    }
    if (l.poLineId) {
      const poLine = po.lines.find((x) => x.id === l.poLineId);
      if (!poLine) errors.push(`PO line ${l.poLineId} not found on this PO`);
      else if (poLine.itemId !== l.itemId) errors.push(`PO line item mismatch on ${l.poLineId}`);
      else if (Number(poLine.pendingQty) < l.receivedQty) {
        errors.push(
          `Over-receipt on PO line ${l.poLineId}: pending ${poLine.pendingQty}, attempting ${l.receivedQty}`,
        );
      }
    }
  }
  if (errors.length) {
    return NextResponse.json({ success: false, error: errors.join("; ") }, { status: 400 });
  }

  const dup = await db.cnGoodsReceiptNote.findFirst({
    where: { tenantId, grnNumber: input.grnNumber, deletedAt: null },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json(
      { success: false, error: `GRN number '${input.grnNumber}' already exists` },
      { status: 409 },
    );
  }

  const grn = await db.cnGoodsReceiptNote.create({
    data: {
      tenantId,
      grnNumber: input.grnNumber,
      poId: input.poId,
      projectId: input.projectId,
      vendorId: input.vendorId,
      grnDate: new Date(input.grnDate),
      locationId: input.locationId,
      supplierInvoiceNo: input.supplierInvoiceNo,
      supplierInvoiceDate: input.supplierInvoiceDate ? new Date(input.supplierInvoiceDate) : null,
      challanNo: input.challanNo,
      challanDate: input.challanDate ? new Date(input.challanDate) : null,
      receivedById: input.receivedById,
      inspectedById: input.inspectedById,
      remarks: input.remarks,
      status: "draft",
      createdBy: userId,
      lines: {
        create: input.lines.map((l) => ({
          poLineId: l.poLineId ?? null,
          itemId: l.itemId,
          receivedQty: l.receivedQty,
          acceptedQty: l.acceptedQty,
          rejectedQty: l.rejectedQty,
          uomId: l.uomId,
          unitRate: l.unitRate,
          amount: l.acceptedQty * l.unitRate,
          qualityStatus: l.qualityStatus,
          batchNo: l.batchNo,
          remarks: l.remarks,
        })),
      },
    },
    include: { lines: true },
  });

  return NextResponse.json({ success: true, data: grn }, { status: 201 });
});
