import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { invoiceFromRabSchema } from "@/lib/schemas/finance";

const withOrgAuth = withOrgAuthForModule("finance");

/**
 * POST /api/finance/invoices/from-rab/[rabId] — materialize an approved RAB
 * into a client invoice. Snapshots customer from project.clientId. RAB must be
 * status=approved (or paid) and not already invoiced.
 */
export const POST = withOrgAuth(async ({ orgId, userId }, req, ctx: { params: { rabId: string } }) => {
  const input = invoiceFromRabSchema.parse(await req.json());

  const rab = await db.cnRAB.findFirst({
    where: { id: ctx.params.rabId, orgId, deletedAt: null },
    include: { project: { select: { id: true, clientId: true } }, invoices: { select: { id: true }, where: { deletedAt: null } } },
  });
  if (!rab) return NextResponse.json({ success: false, error: "RAB not found" }, { status: 404 });
  if (!["approved", "paid"].includes(rab.status)) {
    return NextResponse.json({ success: false, error: "RAB must be approved before invoicing" }, { status: 400 });
  }
  if (rab.invoices.length > 0) {
    return NextResponse.json({ success: false, error: "RAB already invoiced" }, { status: 409 });
  }
  if (!rab.project.clientId) {
    return NextResponse.json({ success: false, error: "Project has no client set" }, { status: 400 });
  }

  const dup = await db.cnClientInvoice.findFirst({ where: { orgId, invoiceNumber: input.invoiceNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `Invoice '${input.invoiceNumber}' already exists` }, { status: 409 });

  const invoice = await db.cnClientInvoice.create({
    data: {
      orgId,
      invoiceNumber: input.invoiceNumber,
      customerId: rab.project.clientId,
      projectId: rab.projectId,
      rabId: rab.id,
      invoiceDate: new Date(input.invoiceDate),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      subtotal: rab.subtotal,
      taxAmount: rab.taxAmount,
      total: rab.total,
      paidAmount: 0,
      status: "sent",
      createdBy: userId,
    },
  });
  return NextResponse.json({ success: true, data: invoice }, { status: 201 });
}, { permission: { resource: "construction.finance", action: "create" } });
