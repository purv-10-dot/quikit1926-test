import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { getTenantCompanyBranding } from "@/lib/services/company-profile";
import { getQuote } from "@/lib/services/quotes/quote-service";
import { toNumber } from "@/lib/services/quotes/decimal";
import { buildCrmDocumentStorageKey, isS3Configured } from "@/lib/storage/documents";
import { putObject } from "@/lib/s3";
import { renderQuoteDocumentHtml } from "./render-html";
import type { QuotePrintPayload } from "./types";
import { getQuoteTemplate } from "../template-service";
import { renderQuotePdfToBuffer } from "./render-quote-pdf-buffer";

export class QuotePdfError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function loadPrintPayload(
  tenantId: string,
  quoteId: string,
): Promise<QuotePrintPayload> {
  const quote = await getQuote(tenantId, quoteId);
  if (!quote) throw new QuotePdfError("Quote not found", 404);

  const [account, contact, company, template] = await Promise.all([
    quote.accountId
      ? db.qcfAccount.findFirst({
          where: { id: quote.accountId, tenantId },
          select: { name: true },
        })
      : null,
    quote.contactId
      ? db.qcfContact.findFirst({
          where: { id: quote.contactId, tenantId },
          select: { firstName: true, lastName: true, email: true },
        })
      : null,
    getTenantCompanyBranding(tenantId),
    getQuoteTemplate(tenantId, quote.templateKey ?? "b2b-standard"),
  ]);

  const isIntraState =
    !!quote.companyState &&
    !!quote.billingState &&
    quote.companyState.trim().toLowerCase() === quote.billingState.trim().toLowerCase();

  return {
    quote: {
      quoteNumber: quote.quoteNumber,
      versionNumber: quote.versionNumber,
      status: quote.status,
      effectiveFrom: quote.effectiveFrom,
      effectiveTo: quote.effectiveTo,
      ownerName: quote.ownerName,
      termsText: quote.termsText,
      grandTotalInWords: quote.grandTotalInWords,
      watermarkText: quote.watermarkText ?? null,
      bankDetailsJson: quote.bankDetailsJson,
      templateKey: quote.templateKey ?? "b2b-standard",
    },
    company,
    account,
    contact,
    template: template
      ? {
          themeColor: template.themeColor,
          watermarkText: template.watermarkText,
          termsDefault: template.termsDefault,
          bankDetailsJson: template.bankDetailsJson,
          headerHtml: template.headerHtml,
          footerHtml: template.footerHtml,
        }
      : null,
    lines: quote.lines.map((l) => ({
      lineNumber: l.lineNumber,
      productName: l.productName,
      sku: l.sku,
      hsnCode: l.hsnCode,
      quantity: toNumber(l.quantity),
      unitPrice: toNumber(l.unitPrice),
      discountPct: toNumber(l.discountPct),
      taxableAmount: toNumber(l.taxableAmount),
      gstRate: toNumber(l.gstRate),
      lineTotal: toNumber(l.lineTotal),
    })),
    totals: {
      subtotal: toNumber(quote.subtotal),
      totalLineDiscount: toNumber(quote.totalLineDiscount),
      overallDiscountAmount: toNumber(quote.overallDiscountAmount),
      freightAmount: toNumber(quote.freightAmount),
      taxableAmount: toNumber(quote.taxableAmount),
      cgstAmount: toNumber(quote.cgstAmount),
      sgstAmount: toNumber(quote.sgstAmount),
      igstAmount: toNumber(quote.igstAmount),
      grandTotal: toNumber(quote.grandTotal),
    },
    isIntraState,
  };
}

/** Build branded HTML for preview / print. */
export async function buildQuotePreviewHtml(
  tenantId: string,
  quoteId: string,
): Promise<string> {
  const payload = await loadPrintPayload(tenantId, quoteId);
  return renderQuoteDocumentHtml(payload);
}

/** Build a server-generated PDF buffer for preview/download. */
export async function buildQuotePreviewPdfBuffer(
  tenantId: string,
  quoteId: string,
): Promise<{ fileName: string; buffer: Buffer }> {
  const quote = await getQuote(tenantId, quoteId);
  if (!quote) throw new QuotePdfError("Quote not found", 404);
  const payload = await loadPrintPayload(tenantId, quoteId);
  const fileName = `${quote.quoteNumber}-v${quote.versionNumber}.pdf`;
  const buffer = await renderQuotePdfToBuffer(payload);
  return { fileName, buffer };
}

/**
 * Generate a locked PDF snapshot: stores HTML in S3 (print-to-PDF ready) and
 * records QcfQuotePdfSnapshot. When S3 is unavailable, returns HTML buffer only.
 */
export async function generateQuotePdfSnapshot(args: {
  tenantId: string;
  quoteId: string;
  userId: string;
  userName: string | null;
}): Promise<{
  snapshotId: string;
  fileName: string;
  storageKey: string | null;
  downloadUrl: string | null;
}> {
  const quote = await getQuote(args.tenantId, args.quoteId);
  if (!quote) throw new QuotePdfError("Quote not found", 404);

  const { fileName, buffer } = await buildQuotePreviewPdfBuffer(args.tenantId, args.quoteId);
  const contentHash = createHash("sha256").update(buffer).digest("hex");

  let storageKey: string | null = null;
  const size = buffer.byteLength;

  if (isS3Configured()) {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    storageKey = buildCrmDocumentStorageKey(args.quoteId, safeName);
    await putObject(storageKey, buffer, "application/pdf");
  }

  const snapshot = await db.$transaction(async (tx) => {
    const row = await tx.qcfQuotePdfSnapshot.create({
      data: {
        tenantId: args.tenantId,
        quoteId: args.quoteId,
        versionNumber: quote.versionNumber,
        templateKey: quote.templateKey ?? "b2b-standard",
        storageKey,
        contentHash,
        fileName,
        contentType: "application/pdf",
        size,
        isLocked: true,
        generatedById: args.userId,
        generatedByName: args.userName,
      },
    });
    await tx.qcfQuote.update({
      where: { id: args.quoteId },
      data: { lockedSnapshotAt: new Date() },
    });
    await tx.qcfActivity.create({
      data: {
        tenantId: args.tenantId,
        type: "QuotePdfGenerated",
        relatedKind: "Quote",
        relatedObjectId: args.quoteId,
        subject: `PDF snapshot v${quote.versionNumber}`,
        detailNotes: fileName,
        ownerId: args.userId,
        occurredAt: new Date(),
      },
    });
    return row;
  });

  const { getCrmUploadDownloadUrl } = await import("@/lib/storage/documents");
  const downloadUrl = storageKey ? await getCrmUploadDownloadUrl(storageKey).catch(() => null) : null;

  return {
    snapshotId: snapshot.id,
    fileName,
    storageKey,
    downloadUrl,
  };
}

export async function listQuotePdfSnapshots(tenantId: string, quoteId: string) {
  return db.qcfQuotePdfSnapshot.findMany({
    where: { tenantId, quoteId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}
