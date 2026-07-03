import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
type Reader = { $queryRaw: Tx["$queryRaw"] };

export type AttachmentInput = { id?: string; file_name: string; content_type?: string | null; size_bytes?: number; data?: string | null };

/** Diff-sync attachments for an entity: keep referenced ids, drop the rest, insert new uploads (data URLs). */
export async function syncAttachments(
  tx: Tx,
  orgId: string,
  entityType: string,
  entityId: string,
  userId: string | null,
  attachments: AttachmentInput[] | undefined
): Promise<void> {
  const list = attachments ?? [];
  const existing = (await tx.$queryRaw`
    SELECT id FROM document_attachments WHERE org_id = ${orgId}::uuid AND entity_type = ${entityType} AND entity_id = ${entityId}::uuid
  `) as Array<{ id: string }>;
  const keep = new Set(list.filter((a) => a.id).map((a) => String(a.id)));
  for (const row of existing) {
    if (!keep.has(String(row.id))) await tx.$executeRaw`DELETE FROM document_attachments WHERE id = ${row.id}::uuid`;
  }
  for (const a of list.filter((x) => !x.id && x.data)) {
    await tx.$executeRaw`
      INSERT INTO document_attachments (org_id, entity_type, entity_id, file_name, file_path, content_type, size_bytes, uploaded_by)
      VALUES (${orgId}::uuid, ${entityType}, ${entityId}::uuid, ${a.file_name}, ${a.data}, ${a.content_type ?? null}, ${Math.trunc(a.size_bytes ?? 0)}, ${userId ? userId : null}::uuid)`;
  }
}

/** Fetch attachments for an entity (size cast to int so JSON can serialize it). */
export async function fetchAttachments(prisma: Reader, orgId: string, entityType: string, entityId: string): Promise<unknown[]> {
  return (await prisma.$queryRaw`
    SELECT id, file_name, file_path, content_type, size_bytes::int AS size_bytes
    FROM document_attachments WHERE org_id = ${orgId}::uuid AND entity_type = ${entityType} AND entity_id = ${entityId}::uuid ORDER BY created_at ASC
  `) as unknown[];
}
