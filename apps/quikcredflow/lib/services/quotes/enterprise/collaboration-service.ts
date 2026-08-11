import { db } from "@/lib/db";

export async function listQuoteComments(orgId: string, quoteId: string) {
  return db.qcfQuoteComment.findMany({
    where: { orgId, quoteId, isInternal: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function addQuoteComment(args: {
  orgId: string;
  quoteId: string;
  body: string;
  authorId: string;
  authorName: string | null;
  mentions?: string[];
}): Promise<{ id: string }> {
  const row = await db.$transaction(async (tx) => {
    const comment = await tx.qcfQuoteComment.create({
      data: {
        orgId: args.orgId,
        quoteId: args.quoteId,
        body: args.body,
        authorId: args.authorId,
        authorName: args.authorName,
        mentions: args.mentions?.length ? args.mentions : undefined,
        isInternal: true,
      },
    });
    await tx.qcfActivity.create({
      data: {
        orgId: args.orgId,
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
