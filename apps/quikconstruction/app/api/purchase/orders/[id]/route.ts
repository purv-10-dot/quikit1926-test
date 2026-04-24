import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("purchase");

export const GET = withTenantAuth<{ id: string }>(async ({ tenantId }, _req, { params }) => {
  const po = await db.cnPurchaseOrder.findFirst({
    where: { id: params.id, tenantId },
    include: {
      project: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
      pr: { select: { id: true, prNumber: true } },
      deliveryLocation: { select: { id: true, name: true } },
      lines: {
        include: {
          item: { select: { id: true, code: true, name: true } },
          uom: { select: { id: true, code: true } },
        },
      },
      grns: { select: { id: true, grnNumber: true, status: true, grnDate: true } },
    },
  });
  if (!po) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: po });
});

export const DELETE = withTenantAuth<{ id: string }>(async ({ tenantId, userId }, _req, { params }) => {
  const existing = await db.cnPurchaseOrder.findFirst({
    where: { id: params.id, tenantId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (existing.status !== "draft") {
    return NextResponse.json({ success: false, error: "Only draft POs can be deleted" }, { status: 400 });
  }
  await db.cnPurchaseOrder.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), updatedBy: userId },
  });
  return NextResponse.json({ success: true });
});
