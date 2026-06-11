import type { DocumentRefType } from "@/lib/services/documents/types";

/** Fired to open the native file picker on an entity documents panel (e.g. from command palette). */
export const DOCUMENT_UPLOAD_REQUEST_EVENT = "quikcrm:document-upload-request";

export type DocumentUploadRequestDetail = {
  refType: DocumentRefType;
  refId: string;
};

export function requestDocumentUpload(detail: DocumentUploadRequestDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DocumentUploadRequestDetail>(DOCUMENT_UPLOAD_REQUEST_EVENT, {
      detail,
    }),
  );
}
