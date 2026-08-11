import type { DocumentRefType } from "@/lib/services/documents/types";
import { isDocumentRefType } from "@/lib/services/documents/types";
import type { FolderScope } from "@/lib/services/document-folders/types";

export function parseFolderScope(searchParams: URLSearchParams): FolderScope | { error: string } {
  const refTypeRaw = searchParams.get("refType")?.trim();
  const refId = searchParams.get("refId")?.trim() || null;

  if (!refTypeRaw && !refId) {
    return { refType: null, refId: null };
  }
  if (!refTypeRaw || !refId) {
    return { error: "refType and refId must both be provided for entity scope" };
  }
  if (!isDocumentRefType(refTypeRaw)) {
    return { error: "Invalid refType" };
  }
  return { refType: refTypeRaw as DocumentRefType, refId };
}

export function parseParentFolderId(searchParams: URLSearchParams): string | null {
  const raw = searchParams.get("parentFolderId");
  if (!raw || raw === "null") return null;
  return raw;
}
