import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { billCreateSchema } from "@/lib/schemas/finance";
import { logAudit } from "@/lib/audit";

const withOrgAuth = withOrgAuthForModule("finance");

export const GET = withOrgAuth(async ({ orgId }, req) => {
  const includeDeleted = req.nextUrl.searchParams.get("includeDeleted") === "true";
  const vendorId = req.nextUrl.searchParams.get("vendorId") || undefined;
  const status = req.nextUrl.searchParams.get("status") || undefined;
  const list = await db.cnVendorBill.findMany({
    where: { orgId, deletedAt: includeDeleted ? { not: null } : null, ...(vendorId ? { vendorId } : {}), ...(status ? { status } : {}) },
    include: {
      vendor: { select: { id: true, name: true, code: true } },
      project: { select: { id: true, name: true, code: true } },
      grn: { select: { id: true, grnNumber: true } },
    },
    orderBy: { billDate: "desc" },
  });
  return NextResponse.json({ success: true, data: list });
}, { permission: { resource: "construction.finance", action: "view" } });

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const input = billCreateSchema.parse(await req.json());
  const dup = await db.cnVendorBill.findFirst({ where: { orgId, billNumber: input.billNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Bill '${input.billNumber}' already exists` }, { status: 409 });
  const vendor = await db.cnVendor.findFirst({ where: { id: input.vendorId, orgId }, select: { id: true } });
  if (!vendor) return NextResponse.json({ success: false, error: "Vendor not found" }, { status: 400 });

  const bill = await db.cnVendorBill.create({
    data: {
      orgId,
      billNumber: input.billNumber,
      vendorId: input.vendorId,
      projectId: input.projectId ?? null,
      grnId: input.grnId ?? null,
      poId: input.poId ?? null,
      supplierInvoiceNo: input.supplierInvoiceNo ?? null,
      supplierInvoiceDate: input.supplierInvoiceDate ? new Date(input.supplierInvoiceDate) : null,
      billDate: new Date(input.billDate),
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
  await logAudit({ orgId, userId, actionType: "create", entityType: "cnVendorBill", entityId: bill.id, entityRef: bill.billNumber, newValues: { billNumber: bill.billNumber, total: bill.total, vendorId: bill.vendorId } });
  return NextResponse.json({ success: true, data: bill }, { status: 201 });
}, { permission: { resource: "construction.finance", action: "create" } });
