/**
 * Aggregator for the order 360 page (/orders/[id]).
 */

import { prisma } from "@/lib/db/prisma";
import type { SessionUser } from "@/types/permission";
import { toNumber } from "@/lib/services/quotes/decimal";
import { buildOrderDashboardSnapshot } from "@/lib/services/orders/dashboard-snapshot";

export type OrderStatus = "Open" | "Confirmed" | "Fulfilled" | "Closed" | "Cancelled";

export interface Order360Line {
  id: string;
  lineNumber: number;
  productName: string;
  sku: string | null;
  hsnCode: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPct: number;
  taxableAmount: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
}

export interface Order360Row {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  currency: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  confirmedAt: string | null;
  fulfilledAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  termsText: string | null;
  internalNotes: string | null;
  ownerName: string | null;
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  freightAmount: number;
  grandTotal: number;
  grandTotalInWords: string | null;
  quoteId: string | null;
  accountId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  quote: { id: string; quoteNumber: string; versionNumber: number } | null;
  lines: Order360Line[];
}

function iso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return typeof d === "string" ? d : d.toISOString();
}

export interface FullOrderRecord {
  order: Order360Row;
  account: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string | null; email: string | null } | null;
  opportunity: { id: string; name: string; stage: string } | null;
  snapshot: ReturnType<typeof buildOrderDashboardSnapshot>;
  activities: Awaited<ReturnType<typeof loadOrderActivities>>;
  attachments: Awaited<ReturnType<typeof loadAttachments>>;
}

async function loadOrderActivities(tenantId: string, orderId: string, quoteId: string | null) {
  const or: { relatedKind: string; relatedObjectId: string }[] = [
    { relatedKind: "Order", relatedObjectId: orderId },
  ];
  if (quoteId) or.push({ relatedKind: "Quote", relatedObjectId: quoteId });

  return prisma.qcfActivity.findMany({
    where: {
      tenantId,
      OR: or,
    },
    orderBy: { occurredAt: "desc" },
    take: 100,
  });
}

async function loadAttachments(tenantId: string, orderId: string) {
  return prisma.qcfDocument.findMany({
    where: {
      tenantId,
      refType: "order",
      refId: orderId,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function getFullOrderRecord(opts: {
  user: SessionUser;
  orderId: string;
}): Promise<FullOrderRecord | null> {
  const { user, orderId } = opts;

  const row = await prisma.qcfOrder.findFirst({
    where: { id: orderId, tenantId: user.tenantId },
    include: {
      lines: { orderBy: [{ sortOrder: "asc" }, { lineNumber: "asc" }] },
      quote: { select: { id: true, quoteNumber: true, versionNumber: true } },
    },
  });
  if (!row) return null;

  const [account, contact, opportunity, activities, attachments] = await Promise.all([
    row.accountId
      ? prisma.qcfAccount.findFirst({
          where: { id: row.accountId, tenantId: user.tenantId },
          select: { id: true, name: true },
        })
      : null,
    row.contactId
      ? prisma.qcfContact.findFirst({
          // QcfContact isn't middleware-protected — don't surface a trashed contact.
          where: { id: row.contactId, tenantId: user.tenantId, deletedAt: null },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : null,
    row.opportunityId
      ? prisma.qcfOpportunity.findFirst({
          where: { id: row.opportunityId, tenantId: user.tenantId },
          select: { id: true, name: true, stage: true },
        })
      : null,
    loadOrderActivities(user.tenantId, orderId, row.quoteId),
    loadAttachments(user.tenantId, orderId),
  ]);

  const order: Order360Row = {
    id: row.id,
    orderNumber: row.orderNumber,
    status: row.status as OrderStatus,
    currency: row.currency,
    orderDate: iso(row.orderDate)!,
    expectedDeliveryDate: iso(row.expectedDeliveryDate),
    confirmedAt: iso(row.confirmedAt),
    fulfilledAt: iso(row.fulfilledAt),
    closedAt: iso(row.closedAt),
    cancelledAt: iso(row.cancelledAt),
    cancellationReason: row.cancellationReason,
    termsText: row.termsText,
    internalNotes: row.internalNotes,
    ownerName: row.ownerName,
    subtotal: toNumber(row.subtotal),
    totalDiscount: toNumber(row.totalDiscount),
    taxableAmount: toNumber(row.taxableAmount),
    cgstAmount: toNumber(row.cgstAmount),
    sgstAmount: toNumber(row.sgstAmount),
    igstAmount: toNumber(row.igstAmount),
    freightAmount: toNumber(row.freightAmount),
    grandTotal: toNumber(row.grandTotal),
    grandTotalInWords: row.grandTotalInWords,
    quoteId: row.quoteId,
    accountId: row.accountId,
    contactId: row.contactId,
    opportunityId: row.opportunityId,
    deletedAt: iso(row.deletedAt),
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
    quote: row.quote,
    lines: row.lines.map((l) => ({
      id: l.id,
      lineNumber: l.lineNumber,
      productName: l.productName,
      sku: l.sku,
      hsnCode: l.hsnCode,
      quantity: toNumber(l.quantity),
      unit: l.unit,
      unitPrice: toNumber(l.unitPrice),
      discountPct: toNumber(l.discountPct),
      taxableAmount: toNumber(l.taxableAmount),
      gstRate: toNumber(l.gstRate),
      cgstAmount: toNumber(l.cgstAmount),
      sgstAmount: toNumber(l.sgstAmount),
      igstAmount: toNumber(l.igstAmount),
      lineTotal: toNumber(l.lineTotal),
    })),
  };

  const snapshot = buildOrderDashboardSnapshot({
    status: order.status,
    grandTotal: order.grandTotal,
    currency: order.currency,
    orderDate: order.orderDate,
    expectedDeliveryDate: order.expectedDeliveryDate,
    lineCount: order.lines.length,
    activitiesCount: activities.length,
    documentsCount: attachments.length,
  });

  return {
    order,
    account,
    contact,
    opportunity,
    snapshot,
    activities,
    attachments,
  };
}
