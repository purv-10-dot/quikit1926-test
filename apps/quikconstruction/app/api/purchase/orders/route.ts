import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { poCreateSchema } from "@/lib/schemas/procurement";

const withTenantAuth = withTenantAuthForModule("purchase");

function computeTotals(lines: Array<{ orderedQty: number; unitRate: number; gstRate?: number | null }>) {
  let subtotal = 0;
  let taxAmount = 0;
  for (const l of lines) {
    const amount = l.orderedQty * l.unitRate;
    const tax = l.gstRate ? amount * (l.gstRate / 100) : 0;
    subtotal += amount;
    taxAmount += tax;
  }
  return { subtotal, taxAmount, totalAmount: subtotal + taxAmount };
}

export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const projectId = req.nextUrl.searchParams.get("projectId") || undefined;
  const vendorId = req.nextUrl.searchParams.get("vendorId") || undefined;
  const pos = await db.cnPurchaseOrder.findMany({
    where: {
      tenantId,
      deletedAt: includeDeleted ? { not: null } : null,
      ...(status ? { status } : {}),
      ...(projectId ? { projectId } : {}),
      ...(vendorId ? { vendorId } : {}),
    },
    include: {
      project: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
    },
    orderBy: { poDate: "desc" },
  });
  return NextResponse.json({ success: true, data: pos });
});

export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const body = await req.json();
  const input = poCreateSchema.parse(body);

  // Validate FKs
  const [project, vendor] = await Promise.all([
    db.cnProject.findFirst({ where: { id: input.projectId, tenantId }, select: { id: true } }),
    db.cnVendor.findFirst({ where: { id: input.vendorId, tenantId }, select: { id: true } }),
  ]);
  if (!project) return NextResponse.json({ success: false, error: "Project not found" }, { status: 400 });
  if (!vendor) return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 400 });

  if (input.prId) {
    const pr = await db.cnPurchaseRequisition.findFirst({
      where: { id: input.prId, tenantId, status: { in: ["approved", "submitted"] } },
      select: { id: true },
    });
    if (!pr) {
      return NextResponse.json(
        { success: false, error: "Source PR must be submitted or approved" },
        { status: 400 },
      );
    }
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

  const totals = computeTotals(input.lines);

  const po = await db.$transaction(async (tx) => {
    const created = await tx.cnPurchaseOrder.create({
      data: {
        tenantId,
        poNumber: input.poNumber,
        projectId: input.projectId,
        vendorId: input.vendorId,
        prId: input.prId ?? null,
        poDate: new Date(input.poDate),
        deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
        deliveryLocationId: input.deliveryLocationId ?? null,
        paymentTermsDays: input.paymentTermsDays ?? null,
        termsConditionId: input.termsConditionId ?? null,
        remarks: input.remarks,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        status: "draft",
        createdBy: userId,
        lines: {
          create: input.lines.map((l) => {
            const amount = l.orderedQty * l.unitRate;
            const taxAmount = l.gstRate ? amount * (l.gstRate / 100) : 0;
            return {
              itemId: l.itemId,
              orderedQty: l.orderedQty,
              pendingQty: l.orderedQty, // full pending at creation
              unitRate: l.unitRate,
              amount,
              gstRate: l.gstRate,
              taxAmount,
              totalAmount: amount + taxAmount,
              uomId: l.uomId,
              deliveryDate: l.deliveryDate ? new Date(l.deliveryDate) : null,
              remarks: l.remarks,
            };
          }),
        },
      },
      include: { lines: true },
    });

    // If sourced from a PR, flip it to converted
    if (input.prId) {
      await tx.cnPurchaseRequisition.update({
        where: { id: input.prId },
        data: { status: "converted", updatedBy: userId },
      });
    }
    return created;
  });

  return NextResponse.json({ success: true, data: po }, { status: 201 });
});
