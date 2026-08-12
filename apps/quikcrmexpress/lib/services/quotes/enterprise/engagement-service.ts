import { db } from "@/lib/db";
import { Prisma, type QceQuoteEngagementStatus } from "@quikit/database";

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
  orgId: string;
  quoteId: string;
  eventType: EngagementEventType;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.qceQuoteEngagementEvent.create({
    data: {
      orgId: args.orgId,
      quoteId: args.quoteId,
      eventType: args.eventType,
      ipAddress: args.ipAddress ?? null,
      userAgent: args.userAgent ?? null,
      metadata: args.metadata
        ? (args.metadata as Prisma.InputJsonValue)
        : undefined,
    },
  });

  const statusMap: Partial<Record<EngagementEventType, QceQuoteEngagementStatus>> = {
    quote_sent: "Sent",
    quote_viewed: "Viewed",
    quote_signed: "Signed",
    quote_accepted: "Accepted",
    quote_rejected: "Rejected",
  };
  const nextStatus = statusMap[args.eventType];
  if (!nextStatus) return;

  const quote = await db.qceQuote.findFirst({
    where: { id: args.quoteId, orgId: args.orgId },
    select: { engagementStatus: true, firstViewedAt: true },
  });
  if (!quote) return;

  const now = new Date();
  await db.qceQuote.update({
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

  await db.qceActivity.create({
    data: {
      orgId: args.orgId,
      type: "QuoteEngagement",
      relatedKind: "Quote",
      relatedObjectId: args.quoteId,
      subject: `Quote ${args.eventType.replace("quote_", "")}`,
      detailNotes: args.ipAddress ? `IP: ${args.ipAddress}` : null,
      occurredAt: now,
    },
  });
}

export async function listQuoteEngagements(orgId: string, quoteId: string) {
  return db.qceQuoteEngagementEvent.findMany({
    where: { orgId, quoteId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
