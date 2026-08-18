import { resolveDocumentPublicUrl } from "@/lib/storage/documents";
import type { DocumentDto, DocumentRefType } from "./types";

export interface DocumentRow {
  id: string;
  refType: string;
  refId: string;
  folderId?: string | null;
  fileName: string;
  contentType: string;
  size: number;
  storageKey: string;
  uploadedBy: string;
  createdAt: Date;
}

export function buildEntityAttachmentDownloadPath(
  refType: DocumentRefType,
  refId: string,
  attachmentId: string,
): string {
  const segment: Record<DocumentRefType, string> = {
    lead: "leads",
    account: "accounts",
    opportunity: "opportunities",
    quote: "quotes",
    order: "orders",
  };
  return `/api/${segment[refType]}/${refId}/attachments/${attachmentId}/download`;
}

export function toDocumentDto(
  row: DocumentRow,
  uploadedByName: string | null = null,
  extra?: Pick<DocumentDto, "relatedLabel" | "relatedHref">,
): DocumentDto {
  const downloadUrl =
    row.refType === "global"
      ? toGlobalDocumentDownloadPath(row.id)
      : buildEntityAttachmentDownloadPath(
          row.refType as DocumentRefType,
          row.refId,
          row.id,
        );
  return {
    id: row.id,
    refType: row.refType as DocumentDto["refType"],
    refId: row.refId,
    folderId: row.folderId ?? null,
    fileName: row.fileName,
    contentType: row.contentType,
    size: row.size,
    storageKey: row.storageKey,
    url: resolveDocumentPublicUrl(row.storageKey),
    downloadUrl,
    uploadedBy: row.uploadedBy,
    uploadedByName,
    createdAt: row.createdAt.toISOString(),
    ...extra,
  };
}

export function toGlobalDocumentDownloadPath(documentId: string): string {
  return `/api/documents/${documentId}/download`;
}
