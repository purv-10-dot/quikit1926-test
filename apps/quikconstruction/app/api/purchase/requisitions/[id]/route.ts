import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("purchase");

export const GET = withTenantAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const pr = await db.cnPurchaseRequisition.findFirst({
    where: { id: params.id, orgId },
    include: {
      project: { select: { id: true, name: true } },
      lines: {
        include: {
          item: { select: { id: true, code: true, name: true } },
          uom: { select: { id: true, code: true } },
        },
      },
      pos: { select: { id: true, poNumber: true, status: true } },
    },
  });
  if (!pr) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: pr });
});

export const DELETE = withTenantAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.cnPurchaseRequisition.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (existing.status !== "draft") {
    return NextResponse.json({ success: false, error: "Only draft PRs can be deleted" }, { status: 400 });
  }
  await db.cnPurchaseRequisition.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), updatedBy: userId },
  });
  return NextResponse.json({ success: true });
});
