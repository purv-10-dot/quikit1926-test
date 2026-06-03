import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";

const withOrgAuth = withOrgAuthForModule("store");

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const grn = await db.cnGoodsReceiptNote.findFirst({
    where: { id: params.id, orgId },
    include: {
      po: { select: { id: true, poNumber: true } },
      project: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      lines: {
        include: {
          item: { select: { id: true, code: true, name: true } },
          uom: { select: { id: true, code: true } },
        },
      },
    },
  });
  if (!grn) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: grn });
}, { permission: { resource: "construction.grn", action: "view" } });

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.cnGoodsReceiptNote.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (existing.status === "posted") {
    return NextResponse.json(
      { success: false, error: "Posted GRNs cannot be deleted. Create a stock adjustment instead." },
      { status: 400 },
    );
  }
  await db.cnGoodsReceiptNote.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), updatedBy: userId },
  });
  return NextResponse.json({ success: true });
}, { permission: { resource: "construction.grn", action: "delete" } });
