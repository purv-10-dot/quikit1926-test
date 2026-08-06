/**
 * Order service — handles the Won-Quote → Order conversion (audit W-2)
 * and standard CRUD over the Order entity.
 *
 * Architecture choices:
 *   - 1:1 with the source Quote (enforced by `quoteId @unique` on
 *     CrmOrder). Re-converting the same quote returns the existing
 *     order (idempotent — Stripe-style retry semantics).
 *   - Snapshot totals. The Order locks the financial contract at
 *     conversion time; future edits to the quote (only possible via
 *     Revise → new quote) don't drift the order's numbers.
 *   - Order numbering reuses CrmSequence with the `order-YYYY` bucket,
 *     so ORD-2026-0001 is just as durable + tenant-isolated as
 *     QT-2026-0001 is.
 *   - Status workflow is *internal* — there's no rich validator yet
 *     (Open → Confirmed → Fulfilled → Closed, or Open → Cancelled).
 *     A formal transition-service can come later when the Invoice
 *     domain hangs off Order; today the API exposes the patch.
 */
import type { CrmOrderStatus, Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { nextFormattedNumber } from "@/lib/services/quotes/sequence";

type DbClient = typeof db | Prisma.TransactionClient;

export class OrderError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

/**
 * Mint the next ORD-YYYY-NNNN for the given tenant. Same lock-and-bump
 * mechanism as `nextQuoteNumber` — concurrent converts serialise on the
 * counter row.
 */
async function nextOrderNumber(
  tx: DbClient,
  tenantId: string,
  issueDate: Date = new Date(),
): Promise<string> {
  const year = issueDate.getUTCFullYear();
  const { formatted } = await nextFormattedNumber(tx, {
    tenantId,
    name: `order-${year}`,
    prefix: `ORD-${year}-`,
    width: 4,
  });
  return formatted;
}

/**
 * Convert a Won quote into an Order. Idempotent — if an order already
 * exists for this quote, returns it instead of minting a duplicate.
 *
 * Validation:
 *   - Quote must exist in tenant
 *   - Quote must be Won (Draft/Active/Lost/Revised are rejected)
 *   - Won quote with an existing order → return that order (no error)
 *
 * Side-effects:
 *   - Creates `CrmOrder` row with all totals snapshotted
 *   - Creates `CrmOrderLine` rows mirroring `CrmQuoteLine` rows
 *   - Writes `CrmActivity{type:OrderCreatedFromQuote}` on the order
 *     and `CrmActivity{type:QuoteConvertedToOrder}` on the quote
 */
export async function createOrderFromQuote(args: {
  tenantId: string;
  userId: string;
  userName: string | null;
  quoteId: string;
  /** Optional override for the order date; defaults to now. */
  orderDate?: Date;
}): Promise<{ id: string; orderNumber: string; alreadyExisted: boolean }> {
  return db.$transaction(async (tx) => {
    // Idempotency check — if an order already exists for this quote in
    // this tenant, return it. The `quoteId @unique` constraint would also
    // catch a duplicate insert, but a soft fail with the existing order
    // is the friendly path (lets the UI redirect to the existing order
    // instead of error-handling a 409).
    const existingOrder = await tx.crmOrder.findFirst({
      where: { tenantId: args.tenantId, quoteId: args.quoteId },
      select: { id: true, orderNumber: true },
    });
    if (existingOrder) {
      return {
        id: existingOrder.id,
        orderNumber: existingOrder.orderNumber,
        alreadyExisted: true,
      };
    }

    const quote = await tx.crmQuote.findFirst({
      where: { id: args.quoteId, tenantId: args.tenantId },
      include: {
        lines: { orderBy: [{ sortOrder: "asc" }, { lineNumber: "asc" }] },
      },
    });
    if (!quote) throw new OrderError("Quote not found", 404);
    if (quote.status !== "Won") {
      throw new OrderError(
        `Only Won quotes can be converted to orders (current status: ${quote.status}).`,
        409,
      );
    }

    const orderDate = args.orderDate ?? new Date();
    const orderNumber = await nextOrderNumber(tx, args.tenantId, orderDate);

    const created = await tx.crmOrder.create({
      data: {
        tenantId: args.tenantId,
        orderNumber,
        quoteId: quote.id,
        opportunityId: quote.opportunityId,
        accountId: quote.accountId,
        contactId: quote.contactId,
        currency: quote.currency,
        status: "Open",
        // Totals are snapshotted from the quote — they don't recompute.
        // `totalDiscount` rolls line + overall discount into one figure
        // so the order header reads cleanly without two separate "kinds
        // of discount" fields downstream.
        subtotal: quote.subtotal,
        totalDiscount: (
          Number(String(quote.totalLineDiscount)) +
          Number(String(quote.overallDiscountAmount))
        ).toFixed(2),
        taxableAmount: quote.taxableAmount,
        cgstAmount: quote.cgstAmount,
        sgstAmount: quote.sgstAmount,
        igstAmount: quote.igstAmount,
        freightAmount: quote.freightAmount,
        grandTotal: quote.grandTotal,
        grandTotalInWords: quote.grandTotalInWords,
        orderDate,
        termsText: quote.termsText,
        ownerId: quote.ownerId,
        ownerName: quote.ownerName,
        createdByUserId: args.userId,
      },
    });

    // Mirror every quote line as an order line. Snapshot semantics —
    // even if the quote line is later (hypothetically) edited, the
    // order keeps its frozen view.
    for (const l of quote.lines) {
      await tx.crmOrderLine.create({
        data: {
          tenantId: args.tenantId,
          orderId: created.id,
          lineNumber: l.lineNumber,
          productId: l.productId,
          productName: l.productName,
          sku: l.sku,
          hsnCode: l.hsnCode,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unitPrice: l.unitPrice,
          discountPct: l.discountPct,
          discountAmount: l.discountAmount,
          taxableAmount: l.taxableAmount,
          gstRate: l.gstRate,
          cgstAmount: l.cgstAmount,
          sgstAmount: l.sgstAmount,
          igstAmount: l.igstAmount,
          lineTotal: l.lineTotal,
          sortOrder: l.sortOrder,
        },
      });
    }

    // Twin activity rows so both timelines surface the conversion. The
    // quote-side row makes it easy for sales to see "this quote turned
    // into ORD-2026-0001". The order-side row is the audit anchor.
    await Promise.all([
      tx.crmActivity.create({
        data: {
          tenantId: args.tenantId,
          type: "OrderCreatedFromQuote",
          relatedKind: "Order",
          relatedObjectId: created.id,
          subject: `${orderNumber} created from ${quote.quoteNumber}`,
          ownerId: args.userId,
          ownerName: args.userName,
          occurredAt: new Date(),
        },
      }),
      tx.crmActivity.create({
        data: {
          tenantId: args.tenantId,
          type: "QuoteConvertedToOrder",
          relatedKind: "Quote",
          relatedObjectId: quote.id,
          subject: `${quote.quoteNumber} converted to ${orderNumber}`,
          ownerId: args.userId,
          ownerName: args.userName,
          occurredAt: new Date(),
        },
      }),
    ]);

    return { id: created.id, orderNumber, alreadyExisted: false };
  });
}

// ---------- Standard CRUD ----------

const LIST_SELECT = {
  id: true,
  orderNumber: true,
  quoteId: true,
  accountId: true,
  opportunityId: true,
  status: true,
  currency: true,
  grandTotal: true,
  orderDate: true,
  expectedDeliveryDate: true,
  confirmedAt: true,
  fulfilledAt: true,
  closedAt: true,
  cancelledAt: true,
  ownerId: true,
  ownerName: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.CrmOrderSelect;

export interface ListOrdersParams {
  tenantId: string;
  page: number;
  pageSize: number;
  status?: CrmOrderStatus;
  accountId?: string;
  q?: string;
  trashed: boolean;
}

export function buildOrderWhere(p: Omit<ListOrdersParams, "page" | "pageSize">): Prisma.CrmOrderWhereInput {
  return {
    tenantId: p.tenantId,
    deletedAt: p.trashed ? { not: null } : null,
    ...(p.status ? { status: p.status } : {}),
    ...(p.accountId ? { accountId: p.accountId } : {}),
    ...(p.q
      ? {
          OR: [{ orderNumber: { contains: p.q, mode: "insensitive" as const } }],
        }
      : {}),
  };
}

export async function listOrders(p: ListOrdersParams) {
  const where = buildOrderWhere(p);
  const [items, total] = await Promise.all([
    db.crmOrder.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ orderDate: "desc" }, { id: "desc" }],
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
    }),
    db.crmOrder.count({ where }),
  ]);

  // Batch-resolve account names (same N+1-avoidance pattern as listQuotes).
  const accountIds = Array.from(
    new Set(items.map((it) => it.accountId).filter(Boolean) as string[]),
  );
  const accounts =
    accountIds.length === 0
      ? []
      : await db.crmAccount.findMany({
          where: { tenantId: p.tenantId, id: { in: accountIds } },
          select: { id: true, name: true },
        });
  const accountById = new Map(accounts.map((a) => [a.id, a.name]));

  const enriched = items.map((it) => ({
    ...it,
    accountName: it.accountId ? accountById.get(it.accountId) ?? null : null,
  }));

  const totalPages = Math.max(1, Math.ceil(total / p.pageSize));
  return { items: enriched, total, page: p.page, pageSize: p.pageSize, totalPages };
}

export async function getOrder(tenantId: string, id: string) {
  return db.crmOrder.findFirst({
    where: { id, tenantId },
    include: {
      lines: { orderBy: [{ sortOrder: "asc" }, { lineNumber: "asc" }] },
      quote: { select: { id: true, quoteNumber: true, versionNumber: true } },
    },
  });
}

export interface UpdateOrderInput {
  status?: CrmOrderStatus;
  expectedDeliveryDate?: string | null;
  cancellationReason?: string | null;
  internalNotes?: string | null;
}

/**
 * Patch order header. Status transitions are *informational* for v1 —
 * sets the appropriate timestamp + an activity row, no strict validator
 * yet (Open ↔ Confirmed ↔ Fulfilled ↔ Closed / Cancelled all allowed
 * through the API). When Invoice ships, harden this with a real
 * state machine.
 */
export async function updateOrder(args: {
  tenantId: string;
  userId: string;
  userName: string | null;
  id: string;
  input: UpdateOrderInput;
}) {
  return db.$transaction(async (tx) => {
    const existing = await tx.crmOrder.findFirst({
      where: { id: args.id, tenantId: args.tenantId },
      select: { id: true, orderNumber: true, status: true },
    });
    if (!existing) throw new OrderError("Order not found", 404);

    const data: Prisma.CrmOrderUncheckedUpdateInput = {};
    const i = args.input;
    const now = new Date();
    if (i.status !== undefined && i.status !== existing.status) {
      data.status = i.status;
      if (i.status === "Confirmed") data.confirmedAt = now;
      if (i.status === "Fulfilled") data.fulfilledAt = now;
      if (i.status === "Closed") data.closedAt = now;
      if (i.status === "Cancelled") {
        data.cancelledAt = now;
        if (i.cancellationReason) data.cancellationReason = i.cancellationReason;
      }
    }
    if (i.expectedDeliveryDate !== undefined) {
      data.expectedDeliveryDate = i.expectedDeliveryDate
        ? new Date(i.expectedDeliveryDate)
        : null;
    }
    if (i.cancellationReason !== undefined) {
      data.cancellationReason = i.cancellationReason ?? null;
    }
    if (i.internalNotes !== undefined) data.internalNotes = i.internalNotes ?? null;

    if (Object.keys(data).length === 0) return existing;

    await tx.crmOrder.update({ where: { id: args.id }, data });

    // Activity row for the change. When the status moved, the subject
    // makes the transition obvious; otherwise it's just "header edited".
    const subject =
      i.status && i.status !== existing.status
        ? `${existing.orderNumber}: ${existing.status} → ${i.status}`
        : `${existing.orderNumber}: header updated`;
    await tx.crmActivity.create({
      data: {
        tenantId: args.tenantId,
        type:
          i.status && i.status !== existing.status
            ? "OrderStatusChange"
            : "OrderHeaderEdited",
        relatedKind: "Order",
        relatedObjectId: args.id,
        subject,
        outcome: i.cancellationReason ?? i.internalNotes ?? "",
        ownerId: args.userId,
        ownerName: args.userName,
        occurredAt: now,
      },
    });

    return tx.crmOrder.findFirst({
      where: { id: args.id, tenantId: args.tenantId },
      select: LIST_SELECT,
    });
  });
}

export async function softDeleteOrder(tenantId: string, id: string): Promise<void> {
  await db.crmOrder.update({
    where: { id, tenantId },
    data: { deletedAt: new Date() },
  });
}
