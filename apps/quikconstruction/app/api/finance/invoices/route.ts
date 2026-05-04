import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { invoiceCreateSchema } from "@/lib/schemas/finance";
import { logAudit } from "@/lib/audit";

const withTenantAuth = withTenantAuthForModule("finance");

export const GET = withTenantAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const customerId = req.nextUrl.searchParams.get("customerId") || undefined;
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const list = await db.cnClientInvoice.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null, ...(customerId ? { customerId } : {}), ...(status ? { status } : {}) },
    include: {
      customer: { select: { id: true, name: true, code: true } },
      project: { select: { id: true, name: true, code: true } },
      rab: { select: { id: true, rabNumber: true } },
    },
    orderBy: { invoiceDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
});

export const POST = withTenantAuth(async ({ orgId, userId }, req) => {
  const input = invoiceCreateSchema.parse(await req.json());
  const dup = await db.cnClientInvoice.findFirst({ where: { orgId, invoiceNumber: input.invoiceNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Invoice '${input.invoiceNumber}' already exists` }, { status: 409 });

  const customer = await db.cnCustomer.findFirst({ where: { id: input.customerId, orgId }, select: { id: true } });
  if (!customer) return NextResponse.json({ success: false, error: "Customer not found" }, { status: 400 });

  const invoice = await db.cnClientInvoice.create({
    data: {
      orgId,
      invoiceNumber: input.invoiceNumber,
      customerId: input.customerId,
      projectId: input.projectId ?? null,
      rabId: input.rabId ?? null,
      invoiceDate: new Date(input.invoiceDate),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      subtotal: input.subtotal,
      taxAmount: input.taxAmount,
      cgstAmount: input.cgstAmount,
      sgstAmount: input.sgstAmount,
      igstAmount: input.igstAmount,
      placeOfSupply: input.placeOfSupply ?? null,
      total: input.total,
      paidAmount: 0,
      status: "draft",
      remarks: input.remarks ?? null,
      createdBy: userId,
      ...(input.lines.length > 0 ? {
        lines: { create: input.lines.map((l, i) => ({
          sortOrder: i,
          description: l.description,
          quantity: l.quantity ?? null,
          uomId: l.uomId ?? null,
          rate: l.rate ?? null,
          amount: l.amount,
          gstRate: l.gstRate ?? null,
          taxAmount: l.taxAmount,
          remarks: l.remarks ?? null,
        })) },
      } : {}),
    },
  });
  await logAudit({ orgId, userId, actionType: "create", entityType: "cnClientInvoice", entityId: invoice.id, entityRef: invoice.invoiceNumber, newValues: { invoiceNumber: invoice.invoiceNumber, total: invoice.total, customerId: invoice.customerId } });
  return NextResponse.json({ success: true, data: invoice }, { status: 201 });
});
