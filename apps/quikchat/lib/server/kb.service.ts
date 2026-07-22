/**
 * Knowledge-base persistence seam (Stage 3 retrieval, Option B "persisted
 * marker"). We do NOT add a table: a KB-ingested doc is already a persisted
 * `Media` QcMessage whose `data` JSON carries `objectPath` (=storageKey). We
 * hang a small `{ kbIngested, kbVisibility, kbIngestedBy, kbIngestedAt }` marker
 * on that same row so a fresh page load can rebuild the conversation's
 * retrieval scope (decision 1: "follow-up just works" survives reload).
 *
 * Two seams:
 *  - markMessageIngested(): direct id lookup (the client owns the messageId),
 *    then a read-modify-write that SPREADS existing `data` (never replaces it —
 *    the row still carries objectPath/mediaType/originalName/size).
 *  - listChannelKbSourceFileIds(): a cold JSON-path list query for the mount
 *    read seam (`GET /kb-docs`). No id to key on there, so the path filter is
 *    the right tool.
 */
import { Prisma } from "@quikit/database";
import { db as prisma } from "@quikit/database";

/**
 * Persist the KB marker on the just-ingested Media message. Located by primary
 * key (`messageId`, the client owns it) — more robust than a JSON-path write
 * lookup across the multiSchema setup. Asserts the row belongs to this
 * org+channel AND that its `objectPath` matches the ingested `storageKey`, so a
 * client can't mark an arbitrary row. Non-fatal by contract: the caller logs
 * and still returns the IngestResult if this throws (retrieval scope rebuilds
 * lazily on the next successful ingest / reload).
 */
export async function markMessageIngested(input: {
  orgId: string;
  channelId: string;
  messageId: string;
  storageKey: string;
  visibility: string;
  userId: string;
  ingestedAt: Date;
}): Promise<void> {
  const row = await prisma.qcMessage.findFirst({
    where: { id: input.messageId, orgId: input.orgId },
    select: { channelId: true, type: true, data: true },
  });
  if (!row) return;
  if (row.channelId !== input.channelId || row.type !== "Media") return;

  const existing =
    row.data && typeof row.data === "object" && !Array.isArray(row.data)
      ? (row.data as Record<string, unknown>)
      : {};
  // Guard: the marked row must be the one that was actually ingested.
  if (existing.objectPath !== input.storageKey) return;

  await prisma.qcMessage.update({
    where: { id: input.messageId },
    data: {
      data: {
        ...existing,
        kbIngested: true,
        kbVisibility: input.visibility,
        kbIngestedBy: input.userId,
        kbIngestedAt: input.ingestedAt.toISOString(),
      } as Prisma.InputJsonValue,
    },
  });
}

/**
 * The channel's persisted KB source-file ids (= storageKeys), for seeding the
 * conversation's retrieval scope on mount and for the relay subset guard.
 * JSON-path list query over all Media messages in the channel carrying the
 * marker (unpaginated, ids only) — pagination-proof, unlike scanning the loaded
 * message window. Channel-scoped: in a shared `/ai` channel this can include
 * other members' PRIVATE-ingested ids; harmless (the runtime drops
 * PRIVATE-not-yours at retrieval) and never arises for the per-user AI-chat
 * singleton that is the Stage-3 surface.
 */
export async function listChannelKbSourceFileIds(
  orgId: string,
  channelId: string,
): Promise<string[]> {
  const rows = await prisma.qcMessage.findMany({
    where: {
      orgId,
      channelId,
      type: "Media",
      data: { path: ["kbIngested"], equals: true },
    },
    select: { data: true },
  });
  const ids: string[] = [];
  for (const row of rows) {
    const data =
      row.data && typeof row.data === "object" && !Array.isArray(row.data)
        ? (row.data as Record<string, unknown>)
        : {};
    if (typeof data.objectPath === "string") ids.push(data.objectPath);
  }
  return [...new Set(ids)];
}
