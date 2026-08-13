export const DOCUMENT_REF_TYPES = ["lead", "account", "opportunity", "quote", "order"] as const;

export type DocumentRefType = (typeof DOCUMENT_REF_TYPES)[number];

/** Entity ref types plus tenant-global library documents (stored as refType `global`). */
export type DocumentScopeRefType = DocumentRefType | "global";

export interface DocumentDto {
  id: string;
  refType: DocumentScopeRefType;
  refId: string;
  folderId: string | null;
  fileName: string;
  contentType: string;
  size: number;
  /** S3 object key (crm-documents/...) stored in DB as storageKey */
  storageKey: string;
  /** Public S3 URL (virtual-hosted); use downloadUrl when bucket is private */
  url: string;
  /** Authenticated proxy that redirects to a presigned S3 GET */
  downloadUrl: string;
  uploadedBy: string;
  uploadedByName: string | null;
  createdAt: string;
  relatedLabel?: string | null;
  relatedHref?: string | null;
  /** Present when row is a QceDocumentLink (same S3 file, no re-upload). */
  isLink?: boolean;
  linkId?: string | null;
  sourceDocumentId?: string | null;
}

export function isDocumentRefType(v: string): v is DocumentRefType {
  return (DOCUMENT_REF_TYPES as readonly string[]).includes(v);
}
