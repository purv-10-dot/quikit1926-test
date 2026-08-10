/**
 * Quote service.
 *
 * Responsibilities:
 *   - Create / read / update / soft-delete QcfQuote rows
 *   - Manage QcfQuoteLine rows under a quote
 *   - Re-compute totals (delegates to ./totals.ts) on every mutation
 *   - Mint QT-YYYY-NNNN numbers via ./sequence.ts on create
 *   - Block edits to non-Draft quotes (status transitions live in
 *     ./transition-service.ts)
 *
 * All writes go through Prisma transactions so totals never get out of sync
 * with the lines that produced them.
 */
import type { QcfQuoteStatus, Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { serverlessTransaction } from "@/lib/db/transaction-options";
import { computeQuoteTotals, decideIntraState } from "./totals";
import { nextQuoteNumber } from "./sequence";
import { resolvePriceForProduct } from "./price-list-service";
import { resolvePriceListIdForQuote } from "./resolve-price-list-for-record";

type DbClient = typeof db | Prisma.TransactionClient;

export class QuoteError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface QuoteLineInputDb {
  productId?: string | null;
  productName: string;
  sku?: string | null;
  hsnCode?: string | null;
  description?: string | null;
  quantity: number;
  unit?: string;
  unitPrice: number;
  discountPct?: number;
  gstRate: number;
  sortOrder?: number;
}

export interface QuoteCreateInput {
  accountId: string;
  contactId?: string | null;
  opportunityId?: string | null;
  priceListId?: string | null;
  currency?: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  companyState?: string | null;
  billingState?: string | null;
  overallDiscountAmount?: number;
  freightAmount?: number;
  termsText?: string | null;
  ownerId?: string | null;
  lines?: QuoteLineInputDb[];
}

export interface QuoteUpdateInput {
  contactId?: string | null;
  opportunityId?: string | null;
  priceListId?: string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  companyState?: string | null;
  billingState?: string | null;
  overallDiscountAmount?: number;
  freightAmount?: number;
  termsText?: string | null;
  ownerId?: string | null;
}

const QUOTE_INCLUDE = {
  lines: { orderBy: [{ sortOrder: "asc" as const }, { lineNumber: "asc" as const }] },
} satisfies Prisma.QcfQuoteInclude;

const LIST_SELECT = {
  id: true,
  quoteNumber: true,
  versionNumber: true,
  parentQuoteId: true,
  accountId: true,
  // Account name joined inline. The relation is a real Prisma relation
  // (QcfQuote.priceList) so this is a single query under the hood — no
  // N+1. Same pattern used by `CrmOpportunity` list endpoints.
  // Note: QcfQuote → QcfAccount isn't currently a typed relation in the
  // schema (accountId is a bare String), so we resolve it via a separate
  // findMany batch in the list service rather than a Prisma include.
  opportunityId: true,
  contactId: true,
  status: true,
  currency: true,
  effectiveFrom: true,
  effectiveTo: true,
  subtotal: true,
  grandTotal: true,
  ownerId: true,
  ownerName: true,
  sentAt: true,
  wonAt: true,
  lostAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.QcfQuoteSelect;

export interface ListQuotesParams {
  orgId: string;
  page: number;
  pageSize: number;
  status?: QcfQuoteStatus;
  accountId?: string;
  opportunityId?: string;
  ownerId?: string;
  q?: string;
  trashed: boolean;
}

export function buildQuoteWhere(p: Omit<ListQuotesParams, "page" | "pageSize">): Prisma.QcfQuoteWhereInput {
  return {
    orgId: p.orgId,
    deletedAt: p.trashed ? { not: null } : null,
    ...(p.status ? { status: p.status } : {}),
    ...(p.accountId ? { accountId: p.accountId } : {}),
    ...(p.opportunityId ? { opportunityId: p.opportunityId } : {}),
    ...(p.ownerId ? { ownerId: p.ownerId } : {}),
    ...(p.q
      ? {
          OR: [
            { quoteNumber: { contains: p.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export async function listQuotes(p: ListQuotesParams) {
  const where = buildQuoteWhere(p);
  const [items, total] = await Promise.all([
    db.qcfQuote.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
    }),
    db.qcfQuote.count({ where }),
  ]);

  // Batch-resolve account names in a single follow-up query (no N+1).
  // Reason we don't `include` it: CrmQuote.accountId is a bare String —
  // there's no typed Prisma relation across schemas. See schema.prisma
  // QcfOpportunity.accountId comment for the cross-schema-FK rationale.
  const accountIds = Array.from(
    new Set(items.map((it) => it.accountId).filter(Boolean) as string[]),
  );
  const accounts =
    accountIds.length === 0
      ? []
      : await db.qcfAccount.findMany({
          where: { orgId: p.orgId, id: { in: accountIds } },
          select: { id: true, name: true },
        });
  const accountById = new Map(accounts.map((a) => [a.id, a.name]));

  const enriched = items.map((it) => ({
    ...it,
    accountName: accountById.get(it.accountId) ?? null,
  }));

  const totalPages = Math.max(1, Math.ceil(total / p.pageSize));
  return { items: enriched, total, page: p.page, pageSize: p.pageSize, totalPages };
}

export async function getQuote(orgId: string, id: string) {
  return db.qcfQuote.findFirst({
    where: { id, orgId },
    include: QUOTE_INCLUDE,
  });
}

/**
 * Recompute totals + GST split for a quote based on its current lines.
 * Caller-supplied tx so this can run as part of a larger update.
 */
function isPriceListInWindow(
  pl: { effectiveFrom: Date | null; effectiveTo: Date | null },
  now: Date,
): boolean {
  if (pl.effectiveFrom && pl.effectiveFrom > now) return false;
  if (pl.effectiveTo && pl.effectiveTo < now) return false;
  return true;
}

/**
 * When a quote is bound to a price list, push list prices onto every line
 * that has a productId. Lines without a product stay as-is.
 */
async function repriceQuoteLinesFromPriceList(
  tx: DbClient,
  orgId: string,
  quoteId: string,
  priceListId: string,
): Promise<number> {
  const lines = await tx.qcfQuoteLine.findMany({
    where: { quoteId, orgId },
    select: { id: true, productId: true, quantity: true },
  });
  let updated = 0;
  for (const line of lines) {
    if (!line.productId) continue;
    const qty = Number(String(line.quantity));
    const resolved = await resolvePriceForProduct({
      orgId,
      productId: line.productId,
      priceListId,
      quantity: qty,
    });
    if (!resolved) continue;
    await tx.qcfQuoteLine.update({
      where: { id: line.id },
      data: {
        unitPrice: resolved.unitPrice,
        discountPct: resolved.discountPct,
      },
    });
    updated += 1;
  }
  return updated;
}

/**
 * Bind a price list to a draft quote: add any list products missing from
 * the quote, then reprice every product line from the list.
 */
async function applyPriceListToQuoteLines(
  tx: DbClient,
  orgId: string,
  quoteId: string,
  priceListId: string,
): Promise<{ added: number; repriced: number }> {
  const now = new Date();
  const pl = await tx.qcfPriceList.findFirst({
    where: { id: priceListId, orgId },
    select: { effectiveFrom: true, effectiveTo: true, isActive: true },
  });
  if (!pl || !pl.isActive || !isPriceListInWindow(pl, now)) {
    return { added: 0, repriced: 0 };
  }

  const plItems = await tx.qcfPriceListItem.findMany({
    where: { orgId, priceListId },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          hsnCode: true,
          defaultUnit: true,
          gstRate: true,
          isActive: true,
        },
      },
    },
    orderBy: [{ productId: "asc" }, { minQuantity: "asc" }],
  });

  // One starter row per product — lowest minQuantity bracket on the list.
  const starterByProduct = new Map<string, (typeof plItems)[number]>();
  for (const row of plItems) {
    if (!row.product?.isActive) continue;
    if (!starterByProduct.has(row.productId)) {
      starterByProduct.set(row.productId, row);
    }
  }

  const q = await tx.qcfQuote.findFirst({
    where: { id: quoteId, orgId },
    select: {
      lines: { select: { productId: true, lineNumber: true, sortOrder: true } },
    },
  });
  if (!q) throw new QuoteError("Quote not found", 404);

  const existingIds = new Set(
    q.lines.map((l) => l.productId).filter((id): id is string => Boolean(id)),
  );

  let maxLine = q.lines.reduce((m, l) => Math.max(m, l.lineNumber), 0);
  let maxSort = q.lines.reduce((m, l) => Math.max(m, l.sortOrder), -1);
  let added = 0;

  for (const item of starterByProduct.values()) {
    const product = item.product;
    if (!product || existingIds.has(product.id)) continue;

    const qty = Math.max(1, item.minQuantity);
    const resolved = await resolvePriceForProduct({
      orgId,
      productId: product.id,
      priceListId,
      quantity: qty,
    });
    if (!resolved) continue;

    maxLine += 1;
    maxSort += 1;
    await tx.qcfQuoteLine.create({
      data: {
        orgId,
        quoteId,
        lineNumber: maxLine,
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        hsnCode: product.hsnCode,
        quantity: qty,
        unit: product.defaultUnit ?? "Each",
        unitPrice: resolved.unitPrice,
        discountPct: resolved.discountPct,
        gstRate: product.gstRate,
        sortOrder: maxSort,
      },
    });
    existingIds.add(product.id);
    added += 1;
  }

  const repriced = await repriceQuoteLinesFromPriceList(tx, orgId, quoteId, priceListId);
  return { added, repriced };
}

async function recomputeQuoteTotals(tx: DbClient, orgId: string, quoteId: string): Promise<void> {
  const quote = await tx.qcfQuote.findFirst({
    where: { id: quoteId, orgId },
    include: QUOTE_INCLUDE,
  });
  if (!quote) throw new QuoteError("Quote not found", 404);

  const intra = decideIntraState(quote.companyState, quote.billingState);
  const totals = computeQuoteTotals({
    lines: quote.lines.map((l) => ({
      quantity: Number(String(l.quantity)),
      unitPrice: Number(String(l.unitPrice)),
      discountPct: Number(String(l.discountPct)),
      gstRate: Number(String(l.gstRate)),
    })),
    overallDiscount: Number(String(quote.overallDiscountAmount ?? 0)),
    freightAmount: Number(String(quote.freightAmount ?? 0)),
    intraState: intra,
  });

  // Fan out per-line writes in parallel inside the transaction. The driver
  // serialises them on the wire anyway (single tx connection), but issuing
  // them as a single Promise.all avoids a JS-side await-per-line round trip
  // on the typed-array Decimal conversions — measurable on 50+ line quotes.
  await Promise.all(
    quote.lines.map((dbLine, i) => {
      const calc = totals.lines[i]!;
      return tx.qcfQuoteLine.update({
        where: { id: dbLine.id },
        data: {
          discountAmount: calc.discountAmount,
          taxableAmount: calc.taxableAmount,
          cgstAmount: calc.cgstAmount,
          sgstAmount: calc.sgstAmount,
          igstAmount: calc.igstAmount,
          lineTotal: calc.lineTotal,
        },
      });
    }),
  );

  await tx.qcfQuote.update({
    where: { id: quoteId },
    data: {
      subtotal: totals.subtotal,
      totalLineDiscount: totals.totalLineDiscount,
      overallDiscountAmount: totals.overallDiscountAmount,
      freightAmount: totals.freightAmount,
      taxableAmount: totals.taxableAmount,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      igstAmount: totals.igstAmount,
      roundOffAmount: totals.roundOffAmount,
      grandTotal: totals.grandTotal,
      grandTotalInWords: totals.grandTotalInWords,
    },
  });
}

export async function createQuote(args: {
  orgId: string;
  userId: string;
  userName: string | null;
  input: QuoteCreateInput;
}): Promise<{ id: string; quoteNumber: string }> {
  const issueDate = args.input.effectiveFrom ? new Date(args.input.effectiveFrom) : new Date();
  const validUntil = args.input.effectiveTo ? new Date(args.input.effectiveTo) : null;

  return serverlessTransaction(db, async (tx) => {
    // FK validation. Without these checks the route only enforces tenant
    // isolation on QcfQuote itself; references to Account / Contact /
    // Opportunity / PriceList are bare strings (no DB-level FK across
    // schemas — see schema.prisma QcfOpportunity comment), so a caller
    // could plant arbitrary IDs.
    const account = await tx.qcfAccount.findFirst({
      where: { id: args.input.accountId, orgId: args.orgId },
      select: { id: true },
    });
    if (!account) throw new QuoteError("Account not found in this tenant", 404);

    if (args.input.contactId) {
      // QcfContact isn't middleware-protected — reject linking to a trashed contact.
      const contact = await tx.qcfContact.findFirst({
        where: { id: args.input.contactId, orgId: args.orgId, deletedAt: null },
        select: { id: true },
      });
      if (!contact) throw new QuoteError("Contact not found in this tenant", 404);
    }
    if (args.input.opportunityId) {
      const opp = await tx.qcfOpportunity.findFirst({
        where: { id: args.input.opportunityId, orgId: args.orgId },
        select: { id: true },
      });
      if (!opp) throw new QuoteError("Opportunity not found in this tenant", 404);
    }
    const resolvedPriceListId = await resolvePriceListIdForQuote({
      orgId: args.orgId,
      accountId: args.input.accountId,
      opportunityId: args.input.opportunityId,
      explicitPriceListId: args.input.priceListId,
      client: tx,
    });

    if (resolvedPriceListId) {
      const pl = await tx.qcfPriceList.findFirst({
        where: { id: resolvedPriceListId, orgId: args.orgId },
        select: { id: true, currency: true },
      });
      if (!pl) throw new QuoteError("Price list not found in this tenant", 404);
      const quoteCurrency = (args.input.currency ?? "INR").toUpperCase();
      if (pl.currency.toUpperCase() !== quoteCurrency) {
        throw new QuoteError(
          `Price list currency (${pl.currency}) doesn't match the quote currency (${quoteCurrency}). Pick a same-currency price list, or change the quote currency first.`,
          409,
        );
      }
    }

    const quoteNumber = await nextQuoteNumber(tx, args.orgId, issueDate);

    const created = await tx.qcfQuote.create({
      data: {
        orgId: args.orgId,
        quoteNumber,
        versionNumber: 1,
        accountId: args.input.accountId,
        contactId: args.input.contactId ?? null,
        opportunityId: args.input.opportunityId ?? null,
        priceListId: resolvedPriceListId,
        currency: (args.input.currency ?? "INR").toUpperCase(),
        effectiveFrom: issueDate,
        effectiveTo: validUntil,
        status: "Draft",
        companyState: args.input.companyState ?? null,
        billingState: args.input.billingState ?? null,
        overallDiscountAmount: args.input.overallDiscountAmount ?? 0,
        freightAmount: args.input.freightAmount ?? 0,
        termsText: args.input.termsText ?? null,
        ownerId: args.input.ownerId ?? args.userId,
        ownerName: args.userName,
        createdByUserId: args.userId,
      },
    });

    // Seed lines if provided.
    if (args.input.lines && args.input.lines.length > 0) {
      for (let i = 0; i < args.input.lines.length; i++) {
        const l = args.input.lines[i]!;
        await tx.qcfQuoteLine.create({
          data: {
            orgId: args.orgId,
            quoteId: created.id,
            lineNumber: i + 1,
            productId: l.productId ?? null,
            productName: l.productName,
            sku: l.sku ?? null,
            hsnCode: l.hsnCode ?? null,
            description: l.description ?? null,
            quantity: l.quantity,
            unit: l.unit ?? "Each",
            unitPrice: l.unitPrice,
            discountPct: l.discountPct ?? 0,
            gstRate: l.gstRate,
            sortOrder: l.sortOrder ?? i,
          },
        });
      }
      await recomputeQuoteTotals(tx, args.orgId, created.id);
    }

    await tx.qcfActivity.create({
      data: {
        orgId: args.orgId,
        type: "QuoteCreated",
        relatedKind: "Quote",
        relatedObjectId: created.id,
        subject: `Quote created: ${quoteNumber}`,
        ownerId: args.userId,
        ownerName: args.userName,
        occurredAt: new Date(),
      },
    });

    return { id: created.id, quoteNumber };
  });
}

function assertDraft(status: QcfQuoteStatus): void {
  if (status !== "Draft") {
    throw new QuoteError(
      "Only Draft quotes can be edited directly. Use Revise to amend an active quote.",
      409,
    );
  }
}

export async function updateQuote(args: {
  orgId: string;
  id: string;
  input: QuoteUpdateInput;
}) {
  return serverlessTransaction(db, async (tx) => {
    const existing = await tx.qcfQuote.findFirst({
      where: { id: args.id, orgId: args.orgId },
      // currency pulled so the price-list mismatch guard below has the
      // current quote-side context without a second read.
      select: { id: true, status: true, currency: true },
    });
    if (!existing) throw new QuoteError("Quote not found", 404);
    assertDraft(existing.status);

    // Currency-mismatch guard when (re)binding a price list (audit W-4).
    if (args.input.priceListId) {
      const pl = await tx.qcfPriceList.findFirst({
        where: { id: args.input.priceListId, orgId: args.orgId },
        select: { id: true, currency: true },
      });
      if (!pl) throw new QuoteError("Price list not found in this tenant", 404);
      if (pl.currency.toUpperCase() !== existing.currency.toUpperCase()) {
        throw new QuoteError(
          `Price list currency (${pl.currency}) doesn't match the quote currency (${existing.currency}).`,
          409,
        );
      }
    }

    const data: Prisma.QcfQuoteUncheckedUpdateInput = {};
    const i = args.input;
    if (i.contactId !== undefined) data.contactId = i.contactId ?? null;
    if (i.opportunityId !== undefined) data.opportunityId = i.opportunityId ?? null;
    const priceListChanged = i.priceListId !== undefined;
    if (priceListChanged) data.priceListId = i.priceListId ?? null;
    if (i.effectiveFrom !== undefined)
      data.effectiveFrom = i.effectiveFrom ? new Date(i.effectiveFrom) : new Date();
    if (i.effectiveTo !== undefined)
      data.effectiveTo = i.effectiveTo ? new Date(i.effectiveTo) : null;
    if (i.companyState !== undefined) data.companyState = i.companyState ?? null;
    if (i.billingState !== undefined) data.billingState = i.billingState ?? null;
    if (i.overallDiscountAmount !== undefined)
      data.overallDiscountAmount = i.overallDiscountAmount;
    if (i.freightAmount !== undefined) data.freightAmount = i.freightAmount;
    if (i.termsText !== undefined) data.termsText = i.termsText ?? null;
    if (i.ownerId !== undefined) data.ownerId = i.ownerId ?? null;

    await tx.qcfQuote.update({ where: { id: args.id }, data });
    if (priceListChanged && i.priceListId) {
      await applyPriceListToQuoteLines(tx, args.orgId, args.id, i.priceListId);
    }
    await recomputeQuoteTotals(tx, args.orgId, args.id);

    // Activity row for the header change (audit finding W-8). We don't
    // diff field-by-field here — the audit timeline says "header edited",
    // and the QcfAuditLog (writeable by `audit()`) is the deeper diff
    // surface when a per-field "who-changed-what" is needed. Skipped when
    // the input is structurally empty (no actual mutation).
    if (Object.keys(data).length > 0) {
      const existingNumber = await tx.qcfQuote.findFirst({
        where: { id: args.id, orgId: args.orgId },
        select: { quoteNumber: true },
      });
      await tx.qcfActivity.create({
        data: {
          orgId: args.orgId,
          type: "QuoteHeaderEdited",
          relatedKind: "Quote",
          relatedObjectId: args.id,
          subject: `${existingNumber?.quoteNumber ?? "Quote"}: header updated`,
          outcome: Object.keys(data).join(", "),
          occurredAt: new Date(),
        },
      });
    }

    return tx.qcfQuote.findFirst({
      where: { id: args.id, orgId: args.orgId },
      include: QUOTE_INCLUDE,
    });
  });
}

export async function softDeleteQuote(orgId: string, id: string): Promise<void> {
  await db.qcfQuote.update({
    where: { id, orgId },
    data: { deletedAt: new Date() },
  });
}

export async function restoreQuote(orgId: string, id: string): Promise<void> {
  await db.qcfQuote.update({
    where: { id, orgId },
    data: { deletedAt: null },
  });
}

export async function permanentDeleteQuote(orgId: string, id: string): Promise<void> {
  await serverlessTransaction(db, async (tx) => {
    const existing = await tx.qcfQuote.findFirst({
      where: { id, orgId, deletedAt: { not: null } },
      select: { id: true, order: { select: { id: true } } },
    });
    if (!existing) {
      const err = new Error("Quote not found in trash");
      (err as { statusCode?: number }).statusCode = 404;
      throw err;
    }
    if (existing.order) {
      const err = new Error(
        "Cannot permanently delete a quote linked to an order. Delete or cancel the order first.",
      );
      (err as { statusCode?: number }).statusCode = 409;
      throw err;
    }
    await tx.qcfQuote.updateMany({
      where: { orgId, parentQuoteId: id },
      data: { parentQuoteId: null },
    });
    await tx.qcfQuote.delete({ where: { id } });
  });
}

/**
 * Mark every Active quote past its `effectiveTo` as Lost with
 * `lostReason="Expired"`. Returns the count of quotes touched + the
 * affected ids so the caller can log / notify.
 *
 * Closes audit finding W-3. Idempotent — running twice doesn't re-mark
 * already-Lost quotes.
 *
 * Designed to be cron-callable. Two delivery options:
 *
 *   Option A — Admin endpoint:
 *     POST /api/quotes/expire-stale         (built — admin only)
 *     A platform-level cron (Vercel Cron, GitHub Action, or a tenant's
 *     own scheduler) pings this once a day.
 *
 *   Option B — BullMQ worker (when the scheduler primitive lands):
 *     Add a repeatable job to lib/queue/worker.ts that calls this
 *     function for every tenant. The function signature is identical.
 *
 * Tenant scoping: caller passes `tenantId`; this function never
 * iterates tenants — that's the caller's responsibility (so admins
 * can run "expire mine only" or platform cron can iterate all).
 */
export async function expireStaleQuotes(
  orgId: string,
  now: Date = new Date(),
): Promise<{ count: number; quoteIds: string[] }> {
  const expired = await db.qcfQuote.findMany({
    where: {
      orgId,
      status: "Active",
      effectiveTo: { lt: now },
    },
    select: { id: true, quoteNumber: true, opportunityId: true },
  });
  if (expired.length === 0) return { count: 0, quoteIds: [] };

  await serverlessTransaction(db, async (tx) => {
    await tx.qcfQuote.updateMany({
      where: {
        orgId,
        status: "Active",
        effectiveTo: { lt: now },
      },
      data: {
        status: "Lost",
        lostAt: now,
        lostReason: "Expired",
        lostNotes: "Auto-marked Lost: validity date passed.",
      },
    });
    // Per-quote activity + status-transition rows. We accept the N writes
    // here (one cron tick, infrequent, tens-not-thousands of expired
    // quotes per run) for the cleaner audit trail.
    for (const q of expired) {
      await tx.qcfQuoteStatusTransition.create({
        data: {
          orgId,
          quoteId: q.id,
          fromStatus: "Active",
          toStatus: "Lost",
          changedByUserId: null,
          changedByName: "system",
          reason: "Expired",
          notes: "Auto-marked Lost: validity date passed.",
        },
      });
      await tx.qcfActivity.create({
        data: {
          orgId,
          type: "QuoteExpired",
          relatedKind: "Quote",
          relatedObjectId: q.id,
          subject: `${q.quoteNumber} auto-lost: effectiveTo passed`,
          ownerName: "system",
          occurredAt: now,
        },
      });
    }
  });

  return { count: expired.length, quoteIds: expired.map((q) => q.id) };
}

/**
 * Record that a quote was sent to the customer. Updates `sentAt` (idempotent
 * — first send wins for the "first-sent-at" semantic) and writes a
 * `QuoteSent` QcfActivity row so the timeline reflects the touch.
 *
 * Allowed from Draft (rare, but useful for sharing a preview) and Active.
 * Other statuses reject — Won/Lost/Revised quotes shouldn't be re-sent.
 */
export async function markQuoteSent(args: {
  orgId: string;
  userId: string;
  userName: string | null;
  quoteId: string;
  recipients: string[];
  subject: string;
  emailMessageId: string;
}) {
  return serverlessTransaction(db, async (tx) => {
    const existing = await tx.qcfQuote.findFirst({
      where: { id: args.quoteId, orgId: args.orgId },
      select: { id: true, quoteNumber: true, status: true, sentAt: true },
    });
    if (!existing) throw new QuoteError("Quote not found", 404);
    if (existing.status !== "Draft" && existing.status !== "Active") {
      throw new QuoteError(
        `Cannot send a ${existing.status} quote. Clone it first to send a fresh version.`,
        409,
      );
    }

    await tx.qcfQuote.update({
      where: { id: args.quoteId },
      data: { sentAt: existing.sentAt ?? new Date() },
    });

    await tx.qcfActivity.create({
      data: {
        orgId: args.orgId,
        type: "QuoteSent",
        relatedKind: "Quote",
        relatedObjectId: args.quoteId,
        subject: `${existing.quoteNumber} sent to ${args.recipients.join(", ")}`,
        outcome: args.subject,
        ownerId: args.userId,
        ownerName: args.userName,
        externalId: args.emailMessageId,
        sourceSystem: "quikcrm.email",
        occurredAt: new Date(),
      },
    });
  });
}

// ---------- Line items ----------

export async function addQuoteLine(args: {
  orgId: string;
  quoteId: string;
  input: QuoteLineInputDb;
}) {
  return serverlessTransaction(db, async (tx) => {
    const q = await tx.qcfQuote.findFirst({
      where: { id: args.quoteId, orgId: args.orgId },
      select: { id: true, status: true, lines: { select: { lineNumber: true, sortOrder: true } } },
    });
    if (!q) throw new QuoteError("Quote not found", 404);
    assertDraft(q.status);

    const maxLine = q.lines.reduce((m, l) => Math.max(m, l.lineNumber), 0);
    const maxSort = q.lines.reduce((m, l) => Math.max(m, l.sortOrder), -1);
    const line = await tx.qcfQuoteLine.create({
      data: {
        orgId: args.orgId,
        quoteId: args.quoteId,
        lineNumber: maxLine + 1,
        productId: args.input.productId ?? null,
        productName: args.input.productName,
        sku: args.input.sku ?? null,
        hsnCode: args.input.hsnCode ?? null,
        description: args.input.description ?? null,
        quantity: args.input.quantity,
        unit: args.input.unit ?? "Each",
        unitPrice: args.input.unitPrice,
        discountPct: args.input.discountPct ?? 0,
        gstRate: args.input.gstRate,
        sortOrder: args.input.sortOrder ?? maxSort + 1,
      },
    });
    await recomputeQuoteTotals(tx, args.orgId, args.quoteId);
    // Activity row (audit finding W-9). Mentions the product name so
    // the timeline reads naturally without forcing a join on activities.
    await tx.qcfActivity.create({
      data: {
        orgId: args.orgId,
        type: "QuoteLineAdded",
        relatedKind: "Quote",
        relatedObjectId: args.quoteId,
        subject: `Line ${maxLine + 1} added: ${args.input.productName}`,
        outcome: `qty ${args.input.quantity} × ${args.input.unitPrice}`,
        occurredAt: new Date(),
      },
    });
    return line;
  });
}

export async function updateQuoteLine(args: {
  orgId: string;
  quoteId: string;
  lineId: string;
  input: Partial<QuoteLineInputDb>;
}) {
  return serverlessTransaction(db, async (tx) => {
    // Two-step ownership: line must belong to the named quote AND that quote
    // must be in this tenant. Without the lineId→quoteId binding, a user
    // could mutate any line in their tenant via a different quote's URL.
    const q = await tx.qcfQuote.findFirst({
      where: { id: args.quoteId, orgId: args.orgId },
      select: { status: true },
    });
    if (!q) throw new QuoteError("Quote not found", 404);
    assertDraft(q.status);

    const line = await tx.qcfQuoteLine.findFirst({
      where: { id: args.lineId, quoteId: args.quoteId, orgId: args.orgId },
      select: { id: true },
    });
    if (!line) throw new QuoteError("Line not found on this quote", 404);

    const data: Prisma.QcfQuoteLineUncheckedUpdateInput = {};
    const i = args.input;
    if (i.productId !== undefined) data.productId = i.productId ?? null;
    if (i.productName !== undefined) data.productName = i.productName;
    if (i.sku !== undefined) data.sku = i.sku ?? null;
    if (i.hsnCode !== undefined) data.hsnCode = i.hsnCode ?? null;
    if (i.description !== undefined) data.description = i.description ?? null;
    if (i.quantity !== undefined) data.quantity = i.quantity;
    if (i.unit !== undefined) data.unit = i.unit;
    if (i.unitPrice !== undefined) data.unitPrice = i.unitPrice;
    if (i.discountPct !== undefined) data.discountPct = i.discountPct;
    if (i.gstRate !== undefined) data.gstRate = i.gstRate;
    if (i.sortOrder !== undefined) data.sortOrder = i.sortOrder;

    await tx.qcfQuoteLine.update({
      where: { id: args.lineId },
      data,
    });
    await recomputeQuoteTotals(tx, args.orgId, args.quoteId);
    // Activity row for the line edit (audit W-9). The keys list keeps it
    // useful at a glance ("unitPrice, discountPct" tells the reader what
    // moved) without leaking the actual new/old values.
    await tx.qcfActivity.create({
      data: {
        orgId: args.orgId,
        type: "QuoteLineEdited",
        relatedKind: "Quote",
        relatedObjectId: args.quoteId,
        subject: `Line edited`,
        outcome: Object.keys(data).join(", "),
        occurredAt: new Date(),
      },
    });
    return tx.qcfQuoteLine.findUnique({ where: { id: args.lineId } });
  });
}

export async function deleteQuoteLine(args: {
  orgId: string;
  quoteId: string;
  lineId: string;
}): Promise<void> {
  await serverlessTransaction(db, async (tx) => {
    const q = await tx.qcfQuote.findFirst({
      where: { id: args.quoteId, orgId: args.orgId },
      select: { status: true },
    });
    if (!q) throw new QuoteError("Quote not found", 404);
    assertDraft(q.status);
    // Same defensive bind: require (lineId, quoteId, orgId) all match.
    // Grab the product name BEFORE deletion so the activity row can name
    // what was removed (the line itself is gone after `deleteMany`).
    const lineForLog = await tx.qcfQuoteLine.findFirst({
      where: { id: args.lineId, quoteId: args.quoteId, orgId: args.orgId },
      select: { productName: true, lineNumber: true },
    });
    const deleted = await tx.qcfQuoteLine.deleteMany({
      where: { id: args.lineId, quoteId: args.quoteId, orgId: args.orgId },
    });
    if (deleted.count === 0) throw new QuoteError("Line not found on this quote", 404);
    await recomputeQuoteTotals(tx, args.orgId, args.quoteId);
    // Activity row for the line removal (audit W-9).
    if (lineForLog) {
      await tx.qcfActivity.create({
        data: {
          orgId: args.orgId,
          type: "QuoteLineRemoved",
          relatedKind: "Quote",
          relatedObjectId: args.quoteId,
          subject: `Line ${lineForLog.lineNumber} removed: ${lineForLog.productName}`,
          occurredAt: new Date(),
        },
      });
    }
  });
}

/**
 * Revise an Active quote: closes the current one as Revised, creates a new
 * Draft (V2/V3/…) with the same line items + header. Caller doesn't supply
 * lines — they're copied verbatim from the predecessor and the rep can
 * edit them on the new Draft.
 */
export async function reviseQuote(args: {
  orgId: string;
  userId: string;
  userName: string | null;
  id: string;
  notes?: string | null;
}): Promise<{ id: string; quoteNumber: string }> {
  return serverlessTransaction(db, async (tx) => {
    const existing = await tx.qcfQuote.findFirst({
      where: { id: args.id, orgId: args.orgId },
      include: QUOTE_INCLUDE,
    });
    if (!existing) throw new QuoteError("Quote not found", 404);
    if (existing.status !== "Active") {
      throw new QuoteError("Only Active quotes can be revised.", 409);
    }

    // 1) Close current
    await tx.qcfQuote.update({
      where: { id: existing.id },
      data: { status: "Revised" },
    });
    await tx.qcfQuoteStatusTransition.create({
      data: {
        orgId: args.orgId,
        quoteId: existing.id,
        fromStatus: "Active",
        toStatus: "Revised",
        changedByUserId: args.userId,
        changedByName: args.userName,
        notes: args.notes ?? null,
      },
    });

    // 2) Create new Draft V(N+1) with the same lines copied over. We keep
    // the quote number stable by appending the version suffix so PDFs and
    // emails are unambiguous: QT-2026-001-V2.
    const newQuoteNumber = `${stripVersionSuffix(existing.quoteNumber)}-V${existing.versionNumber + 1}`;
    const created = await tx.qcfQuote.create({
      data: {
        orgId: args.orgId,
        quoteNumber: newQuoteNumber,
        versionNumber: existing.versionNumber + 1,
        parentQuoteId: existing.id,
        accountId: existing.accountId,
        contactId: existing.contactId,
        opportunityId: existing.opportunityId,
        priceListId: existing.priceListId,
        currency: existing.currency,
        effectiveFrom: new Date(),
        effectiveTo: existing.effectiveTo,
        status: "Draft",
        pricingMode: existing.pricingMode,
        companyState: existing.companyState,
        billingState: existing.billingState,
        overallDiscountAmount: existing.overallDiscountAmount,
        freightAmount: existing.freightAmount,
        termsText: existing.termsText,
        ownerId: existing.ownerId,
        ownerName: existing.ownerName,
        createdByUserId: args.userId,
      },
    });

    for (const l of existing.lines) {
      await tx.qcfQuoteLine.create({
        data: {
          orgId: args.orgId,
          quoteId: created.id,
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
          gstRate: l.gstRate,
          sortOrder: l.sortOrder,
        },
      });
    }

    await recomputeQuoteTotals(tx, args.orgId, created.id);

    await tx.qcfActivity.create({
      data: {
        orgId: args.orgId,
        type: "QuoteRevised",
        relatedKind: "Quote",
        relatedObjectId: created.id,
        subject: `Quote revised: ${existing.quoteNumber} → ${newQuoteNumber}`,
        ownerId: args.userId,
        ownerName: args.userName,
        occurredAt: new Date(),
      },
    });

    return { id: created.id, quoteNumber: newQuoteNumber };
  });
}

function stripVersionSuffix(quoteNumber: string): string {
  // Strip -V2, -V3, … so revisions of revisions stay flat: QT-2026-001-V3
  // not QT-2026-001-V2-V3.
  return quoteNumber.replace(/-V\d+$/u, "");
}

/**
 * Build the full revision chain for a quote — every quote that shares
 * the same family root (oldest ancestor with `parentQuoteId == null`).
 * Returns the chain sorted by version number ASC so the UI can render
 * a left-to-right timeline: V1 → V2 → V3 → current.
 *
 * Closes audit finding W-10. Cheap: tenant + parentQuoteId is indexed
 * (`@@index([tenantId, parentQuoteId])`), and chains are shallow in
 * practice — even heavily-negotiated quotes rarely exceed 5 versions.
 *
 * Algorithm:
 *   1. Walk up via parentQuoteId until we hit a null root.
 *   2. From the root, fetch ALL descendants in one query
 *      (`parentQuoteId IN [root, V2, V3, …]`) — single round-trip.
 *   3. Sort by versionNumber and return.
 */
export async function loadRevisionChain(
  orgId: string,
  quoteId: string,
  parentQuoteId: string | null,
): Promise<Array<{
  id: string;
  quoteNumber: string;
  versionNumber: number;
  status: QcfQuoteStatus;
  grandTotal: number;
  createdAt: Date;
  isCurrent: boolean;
}>> {
  // Fast path — no parent and no children means this quote is a
  // standalone V1 (the common case). Skip the walks entirely.
  // We check for children via a count to avoid a needless full chain
  // fetch for unrevised quotes.
  if (!parentQuoteId) {
    const childCount = await db.qcfQuote.count({
      where: { orgId, parentQuoteId: quoteId },
    });
    if (childCount === 0) return [];
  }

  // Walk up to the root (the V1 with no parent).
  let rootId = parentQuoteId ?? quoteId;
  // Cap the walk at 20 steps as a safety belt against accidentally-
  // cyclic parentQuoteId (shouldn't happen, but cheap to defend).
  for (let i = 0; i < 20; i++) {
    const node = await db.qcfQuote.findFirst({
      where: { id: rootId, orgId },
      select: { id: true, parentQuoteId: true },
    });
    if (!node || !node.parentQuoteId) {
      rootId = node?.id ?? rootId;
      break;
    }
    rootId = node.parentQuoteId;
  }

  // BFS down from the root. Most revision trees are linear chains
  // (V1 → V2 → V3) but the schema doesn't forbid forks (V2a, V2b from
  // V1) — this handles both.
  const family: Array<{
    id: string;
    quoteNumber: string;
    versionNumber: number;
    status: QcfQuoteStatus;
    grandTotal: Prisma.Decimal | number | string;
    createdAt: Date;
    parentQuoteId: string | null;
  }> = [];
  const queue: string[] = [rootId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const ids = queue.splice(0, queue.length).filter((id) => !seen.has(id));
    ids.forEach((id) => seen.add(id));
    if (ids.length === 0) break;
    const rows = await db.qcfQuote.findMany({
      where: {
        orgId,
        OR: [{ id: { in: ids } }, { parentQuoteId: { in: ids } }],
      },
      select: {
        id: true,
        quoteNumber: true,
        versionNumber: true,
        status: true,
        grandTotal: true,
        createdAt: true,
        parentQuoteId: true,
      },
    });
    for (const r of rows) {
      if (!seen.has(r.id)) {
        family.push(r);
        queue.push(r.id);
      }
    }
  }

  return family
    .sort((a, b) => a.versionNumber - b.versionNumber || a.createdAt.getTime() - b.createdAt.getTime())
    .map((r) => ({
      id: r.id,
      quoteNumber: r.quoteNumber,
      versionNumber: r.versionNumber,
      status: r.status,
      grandTotal: Number(String(r.grandTotal)),
      createdAt: r.createdAt,
      isCurrent: r.id === quoteId,
    }));
}

/**
 * Clone a quote into a brand-new Draft with a freshly-minted quote number.
 *
 * Distinct from Revise:
 *   - Revise closes the parent as `Revised` and emits V(N+1) under the
 *     SAME quote number. It's the "I need to amend this quote for the
 *     same customer" workflow.
 *   - Clone leaves the parent untouched and produces a NEW quote number
 *     with versionNumber=1 and parentQuoteId=null. It's the "I'm sending
 *     a similar quote to a different customer (or to the same customer
 *     for a repeat purchase)" workflow.
 *
 * Status of the parent is irrelevant — clone is allowed from any status
 * (Draft, Active, Won, Lost, Revised). Lines are deep-copied with all
 * snapshot fields preserved.
 */
export async function cloneQuote(args: {
  orgId: string;
  userId: string;
  userName: string | null;
  id: string;
}): Promise<{ id: string; quoteNumber: string }> {
  return serverlessTransaction(db, async (tx) => {
    const existing = await tx.qcfQuote.findFirst({
      where: { id: args.id, orgId: args.orgId },
      include: QUOTE_INCLUDE,
    });
    if (!existing) throw new QuoteError("Quote not found", 404);

    const issueDate = new Date();
    const newQuoteNumber = await nextQuoteNumber(tx, args.orgId, issueDate);

    const created = await tx.qcfQuote.create({
      data: {
        orgId: args.orgId,
        quoteNumber: newQuoteNumber,
        versionNumber: 1,
        parentQuoteId: null,
        accountId: existing.accountId,
        contactId: existing.contactId,
        opportunityId: existing.opportunityId,
        priceListId: existing.priceListId,
        currency: existing.currency,
        effectiveFrom: issueDate,
        effectiveTo: existing.effectiveTo,
        status: "Draft",
        pricingMode: existing.pricingMode,
        companyState: existing.companyState,
        billingState: existing.billingState,
        overallDiscountAmount: existing.overallDiscountAmount,
        freightAmount: existing.freightAmount,
        termsText: existing.termsText,
        ownerId: args.userId,
        ownerName: args.userName,
        createdByUserId: args.userId,
      },
    });

    for (const l of existing.lines) {
      await tx.qcfQuoteLine.create({
        data: {
          orgId: args.orgId,
          quoteId: created.id,
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
          gstRate: l.gstRate,
          sortOrder: l.sortOrder,
        },
      });
    }

    await recomputeQuoteTotals(tx, args.orgId, created.id);

    await tx.qcfActivity.create({
      data: {
        orgId: args.orgId,
        type: "QuoteCloned",
        relatedKind: "Quote",
        relatedObjectId: created.id,
        subject: `Quote cloned: ${existing.quoteNumber} → ${newQuoteNumber}`,
        ownerId: args.userId,
        ownerName: args.userName,
        occurredAt: new Date(),
      },
    });

    return { id: created.id, quoteNumber: newQuoteNumber };
  });
}
