import { db } from "@/lib/db";
import { toNumber } from "@/lib/services/quotes/decimal";
import { QuoteError } from "@/lib/services/quotes/quote-service";

async function nextInvoiceNumber(tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const name = `invoice-${year}`;
  const row = await db.crmSequence.upsert({
    where: { sequence_uk: { tenantId, name } },
    create: { tenantId, name, counter: 1 },
    update: { counter: { increment: 1 } },
  });
  const n = String(row.counter).padStart(4, "0");
  return `INV-${year}-${n}`;
}

export async function createInvoiceFromQuote(args: {
  tenantId: string;
  quoteId: string;
  userId: string;
  userName: string | null;
  dueInDays?: number;
}): Promise<{ invoiceId: string; invoiceNumber: string }> {
  const quote = await db.crmQuote.findFirst({
    where: { id: args.quoteId, tenantId: args.tenantId, deletedAt: null, status: "Won" },
  });
  if (!quote) throw new QuoteError("Won quote required to create invoice", 400);

  const existing = await db.crmInvoice.findFirst({
    where: { tenantId: args.tenantId, quoteId: args.quoteId },
  });
  if (existing) {
    return { invoiceId: existing.id, invoiceNumber: existing.invoiceNumber };
  }

  const invoiceNumber = await nextInvoiceNumber(args.tenantId);
  const dueDate =
    args.dueInDays && args.dueInDays > 0
      ? new Date(Date.now() + args.dueInDays * 86_400_000)
      : null;

  const invoice = await db.$transaction(async (tx) => {
    const row = await tx.crmInvoice.create({
      data: {
        tenantId: args.tenantId,
        invoiceNumber,
        quoteId: quote.id,
        accountId: quote.accountId,
        contactId: quote.contactId,
        currency: quote.currency,
        status: "Draft",
        subtotal: quote.subtotal,
        totalDiscount: quote.totalLineDiscount,
        taxableAmount: quote.taxableAmount,
        cgstAmount: quote.cgstAmount,
        sgstAmount: quote.sgstAmount,
        igstAmount: quote.igstAmount,
        freightAmount: quote.freightAmount,
        grandTotal: quote.grandTotal,
        grandTotalInWords: quote.grandTotalInWords,
        termsText: quote.termsText,
        ownerId: quote.ownerId,
        ownerName: quote.ownerName,
        dueDate,
      },
    });
    await tx.crmActivity.create({
      data: {
        tenantId: args.tenantId,
        type: "InvoiceCreated",
        relatedKind: "Quote",
        relatedObjectId: quote.id,
        subject: `Invoice ${invoiceNumber} created`,
        ownerId: args.userId,
        occurredAt: new Date(),
      },
    });
    return row;
  });

  return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber };
}

export async function listInvoices(tenantId: string, page = 1, pageSize = 25) {
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    db.crmInvoice.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    db.crmInvoice.count({ where: { tenantId, deletedAt: null } }),
  ]);
  return {
    items: items.map((i) => ({
      ...i,
      grandTotal: toNumber(i.grandTotal),
    })),
    total,
    page,
    pageSize,
  };
}
