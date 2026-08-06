import type { CrmQuoteApprovalStatus } from "@quikit/database";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/services/quotes/decimal";
import { getQuoteEnterpriseSettings } from "./settings";

export class QuoteApprovalError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface ApprovalEvaluation {
  required: boolean;
  reasons: string[];
}

export async function evaluateQuoteApproval(
  tenantId: string,
  quoteId: string,
): Promise<ApprovalEvaluation> {
  const rules = (await getQuoteEnterpriseSettings(tenantId)).approval;
  const quote = await db.crmQuote.findFirst({
    where: { id: quoteId, tenantId, deletedAt: null },
    include: { lines: true },
  });
  if (!quote) throw new QuoteApprovalError("Quote not found", 404);

  const reasons: string[] = [];
  const grandTotal = toNumber(quote.grandTotal);
  if (grandTotal >= rules.minAmountForApproval) {
    reasons.push(`Quote value ₹${grandTotal.toLocaleString("en-IN")} exceeds approval threshold`);
  }

  let maxLineDiscount = 0;
  for (const line of quote.lines) {
    const pct = toNumber(line.discountPct);
    if (pct > maxLineDiscount) maxLineDiscount = pct;
  }
  if (maxLineDiscount > rules.maxDiscountPctWithoutApproval) {
    reasons.push(
      `Line discount ${maxLineDiscount}% exceeds ${rules.maxDiscountPctWithoutApproval}% limit`,
    );
  }

  if (toNumber(quote.overallDiscountAmount) > 0 && grandTotal >= rules.minAmountForApproval / 2) {
    reasons.push("Overall discount applied on a high-value quote");
  }

  return { required: reasons.length > 0, reasons };
}

export async function requestQuoteApproval(args: {
  tenantId: string;
  quoteId: string;
  userId: string;
  userName: string | null;
}): Promise<{ approvalId: string; reasons: string[] }> {
  const evaluation = await evaluateQuoteApproval(args.tenantId, args.quoteId);
  if (!evaluation.required) {
    throw new QuoteApprovalError("This quote does not require approval.", 400);
  }

  const quote = await db.crmQuote.findFirst({
    where: { id: args.quoteId, tenantId: args.tenantId },
    select: { approvalStatus: true },
  });
  if (!quote) throw new QuoteApprovalError("Quote not found", 404);
  if (quote.approvalStatus === "Pending") {
    throw new QuoteApprovalError("Approval is already pending.", 409);
  }

  const triggerReason = evaluation.reasons.join("; ");
  const row = await db.$transaction(async (tx) => {
    const approval = await tx.crmQuoteApproval.create({
      data: {
        tenantId: args.tenantId,
        quoteId: args.quoteId,
        status: "Pending",
        triggerReason,
        requestedById: args.userId,
        requestedByName: args.userName,
      },
    });
    await tx.crmQuote.update({
      where: { id: args.quoteId },
      data: { approvalStatus: "Pending" },
    });
    await tx.crmActivity.create({
      data: {
        tenantId: args.tenantId,
        type: "QuoteApprovalRequested",
        relatedKind: "Quote",
        relatedObjectId: args.quoteId,
        subject: "Quote approval requested",
        detailNotes: triggerReason,
        ownerId: args.userId,
        occurredAt: new Date(),
      },
    });
    return approval;
  });

  return { approvalId: row.id, reasons: evaluation.reasons };
}

export async function decideQuoteApproval(args: {
  tenantId: string;
  quoteId: string;
  approvalId: string;
  decision: "Approved" | "Rejected";
  userId: string;
  userName: string | null;
  notes?: string | null;
}): Promise<void> {
  const approval = await db.crmQuoteApproval.findFirst({
    where: {
      id: args.approvalId,
      quoteId: args.quoteId,
      tenantId: args.tenantId,
      status: "Pending",
    },
  });
  if (!approval) throw new QuoteApprovalError("Pending approval not found", 404);

  const status: CrmQuoteApprovalStatus = args.decision;
  await db.$transaction(async (tx) => {
    await tx.crmQuoteApproval.update({
      where: { id: approval.id },
      data: {
        status,
        decidedById: args.userId,
        decidedByName: args.userName,
        decisionNotes: args.notes ?? null,
        decidedAt: new Date(),
      },
    });
    await tx.crmQuote.update({
      where: { id: args.quoteId },
      data: { approvalStatus: status },
    });
    await tx.crmActivity.create({
      data: {
        tenantId: args.tenantId,
        type: "QuoteApprovalDecided",
        relatedKind: "Quote",
        relatedObjectId: args.quoteId,
        subject: `Quote ${args.decision.toLowerCase()}`,
        detailNotes: args.notes ?? approval.triggerReason,
        ownerId: args.userId,
        occurredAt: new Date(),
      },
    });
  });
}

export async function listApprovalInbox(tenantId: string) {
  return db.crmQuoteApproval.findMany({
    where: { tenantId, status: "Pending" },
    orderBy: { requestedAt: "asc" },
    include: {
      quote: {
        select: {
          id: true,
          quoteNumber: true,
          grandTotal: true,
          accountId: true,
          ownerName: true,
          status: true,
        },
      },
    },
  });
}

export async function assertQuoteApprovedForSend(
  tenantId: string,
  quoteId: string,
): Promise<void> {
  const evaluation = await evaluateQuoteApproval(tenantId, quoteId);
  if (!evaluation.required) return;
  const quote = await db.crmQuote.findFirst({
    where: { id: quoteId, tenantId },
    select: { approvalStatus: true },
  });
  if (quote?.approvalStatus !== "Approved") {
    throw new QuoteApprovalError(
      "Quote requires manager approval before send or activation.",
      403,
    );
  }
}
