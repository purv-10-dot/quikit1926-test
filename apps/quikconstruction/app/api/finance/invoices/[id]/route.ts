import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";

const withTenantAuth = withTenantAuthForModule("finance");

export const GET = withTenantAuth(async ({ tenantId }, _req, ctx: { params: { id: string } }) => {
  const inv = await db.cnClientInvoice.findFirst({
    where: { id: ctx.params.id, tenantId },
    include: {
      customer: true,
      project: { select: { id: true, name: true, code: true } },
      rab: { select: { id: true, rabNumber: true, rabDate: true } },
      allocations: { include: { receipt: { select: { id: true, receiptNumber: true, receiptDate: true, mode: true } } } },
      lines: { orderBy: { sortOrder: "asc" }, include: { uom: { select: { code: true } } } },
      creditNotes: { where: { deletedAt: null }, select: { id: true, noteNumber: true, amount: true, noteDate: true, status: true } },
    },
  });
  if (!inv) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: inv });
});

export const DELETE = withTenantAuth(async ({ tenantId, userId }, _req, ctx: { params: { id: string } }) => {
  const inv = await db.cnClientInvoice.findFirst({ where: { id: ctx.params.id, tenantId }, select: { id: true, paidAmount: true } });
  if (!inv) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  if (Number(inv.paidAmount) > 0) return NextResponse.json({ success: false, error: "Cannot delete invoice with receipts; reverse allocations first" }, { status: 400 });
  await db.cnClientInvoice.update({ where: { id: ctx.params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  return NextResponse.json({ success: true });
});
