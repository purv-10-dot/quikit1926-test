import { db } from "@/lib/db";

export async function listQuoteComments(tenantId: string, quoteId: string) {
  return db.crmQuoteComment.findMany({
    where: { tenantId, quoteId, isInternal: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function addQuoteComment(args: {
  tenantId: string;
  quoteId: string;
  body: string;
  authorId: string;
  authorName: string | null;
  mentions?: string[];
}): Promise<{ id: string }> {
  const row = await db.$transaction(async (tx) => {
    const comment = await tx.crmQuoteComment.create({
      data: {
        tenantId: args.tenantId,
        quoteId: args.quoteId,
        body: args.body,
        authorId: args.authorId,
        authorName: args.authorName,
        mentions: args.mentions?.length ? args.mentions : undefined,
        isInternal: true,
      },
    });
    await tx.crmActivity.create({
      data: {
        tenantId: args.tenantId,
        type: "QuoteComment",
        relatedKind: "Quote",
        relatedObjectId: args.quoteId,
        subject: "Internal comment",
        detailNotes: args.body.slice(0, 500),
        ownerId: args.authorId,
        occurredAt: new Date(),
      },
    });
    return comment;
  });
  return { id: row.id };
}
