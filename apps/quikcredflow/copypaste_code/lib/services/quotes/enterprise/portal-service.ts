import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { QuoteError } from "@/lib/services/quotes/quote-service";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generatePortalToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createQuotePortalLink(args: {
  tenantId: string;
  quoteId: string;
  userId: string;
  expiresInDays?: number;
  origin: string;
}): Promise<{ url: string; expiresAt: string | null }> {
  const quote = await db.crmQuote.findFirst({
    where: { id: args.quoteId, tenantId: args.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!quote) throw new QuoteError("Quote not found", 404);

  const token = generatePortalToken();
  const tokenHash = hashToken(token);
  const expiresAt =
    args.expiresInDays && args.expiresInDays > 0
      ? new Date(Date.now() + args.expiresInDays * 86_400_000)
      : null;

  await db.$transaction(async (tx) => {
    await tx.crmQuotePortalAccess.create({
      data: {
        tenantId: args.tenantId,
        quoteId: args.quoteId,
        tokenHash,
        expiresAt,
        createdById: args.userId,
      },
    });
    await tx.crmQuote.update({
      where: { id: args.quoteId },
      data: {
        portalTokenHash: tokenHash,
        portalExpiresAt: expiresAt,
      },
    });
  });

  const url = `${args.origin.replace(/\/$/, "")}/portal/quotes/${token}`;
  return { url, expiresAt: expiresAt?.toISOString() ?? null };
}

export async function resolvePortalToken(token: string): Promise<{
  tenantId: string;
  quoteId: string;
} | null> {
  const tokenHash = hashToken(token);
  const access = await db.crmQuotePortalAccess.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { tenantId: true, quoteId: true, id: true },
  });
  if (!access) return null;

  await db.crmQuotePortalAccess.update({
    where: { id: access.id },
    data: { lastUsedAt: new Date() },
  });

  return { tenantId: access.tenantId, quoteId: access.quoteId };
}

export async function portalAcceptQuote(args: {
  tenantId: string;
  quoteId: string;
  comment?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const now = new Date();
  await db.crmQuote.update({
    where: { id: args.quoteId },
    data: {
      acceptedAt: now,
      customerComment: args.comment ?? null,
      engagementStatus: "Accepted",
    },
  });
  const { recordQuoteEngagement } = await import("./engagement-service");
  await recordQuoteEngagement({
    tenantId: args.tenantId,
    quoteId: args.quoteId,
    eventType: "quote_accepted",
    ipAddress: args.ipAddress,
    userAgent: args.userAgent,
  });
}

export async function portalRejectQuote(args: {
  tenantId: string;
  quoteId: string;
  reason: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const now = new Date();
  await db.crmQuote.update({
    where: { id: args.quoteId },
    data: {
      rejectedAt: now,
      rejectedReason: args.reason,
      engagementStatus: "Rejected",
    },
  });
  const { recordQuoteEngagement } = await import("./engagement-service");
  await recordQuoteEngagement({
    tenantId: args.tenantId,
    quoteId: args.quoteId,
    eventType: "quote_rejected",
    ipAddress: args.ipAddress,
    userAgent: args.userAgent,
    metadata: { reason: args.reason },
  });
}
