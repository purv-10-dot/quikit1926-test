import { db } from "@/lib/db";
import { Prisma, type CrmQuoteEngagementStatus } from "@quikit/database";

export type EngagementEventType =
  | "quote_sent"
  | "quote_viewed"
  | "quote_downloaded"
  | "quote_clicked"
  | "quote_accepted"
  | "quote_rejected"
  | "quote_signed"
  | "quote_commented";

export async function recordQuoteEngagement(args: {
  tenantId: string;
  quoteId: string;
  eventType: EngagementEventType;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.crmQuoteEngagementEvent.create({
    data: {
      tenantId: args.tenantId,
      quoteId: args.quoteId,
      eventType: args.eventType,
      ipAddress: args.ipAddress ?? null,
      userAgent: args.userAgent ?? null,
      metadata: args.metadata
        ? (args.metadata as Prisma.InputJsonValue)
        : undefined,
    },
  });

  const statusMap: Partial<Record<EngagementEventType, CrmQuoteEngagementStatus>> = {
    quote_sent: "Sent",
    quote_viewed: "Viewed",
    quote_signed: "Signed",
    quote_accepted: "Accepted",
    quote_rejected: "Rejected",
  };
  const nextStatus = statusMap[args.eventType];
  if (!nextStatus) return;

  const quote = await db.crmQuote.findFirst({
    where: { id: args.quoteId, tenantId: args.tenantId },
    select: { engagementStatus: true, firstViewedAt: true },
  });
  if (!quote) return;

  const now = new Date();
  await db.crmQuote.update({
    where: { id: args.quoteId },
    data: {
      engagementStatus: nextStatus,
      ...(args.eventType === "quote_viewed"
        ? {
            firstViewedAt: quote.firstViewedAt ?? now,
            lastViewedAt: now,
            lastViewedIp: args.ipAddress ?? null,
          }
        : {}),
    },
  });

  await db.crmActivity.create({
    data: {
      tenantId: args.tenantId,
      type: "QuoteEngagement",
      relatedKind: "Quote",
      relatedObjectId: args.quoteId,
      subject: `Quote ${args.eventType.replace("quote_", "")}`,
      detailNotes: args.ipAddress ? `IP: ${args.ipAddress}` : null,
      occurredAt: now,
    },
  });
}

export async function listQuoteEngagements(tenantId: string, quoteId: string) {
  return db.crmQuoteEngagementEvent.findMany({
    where: { tenantId, quoteId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
