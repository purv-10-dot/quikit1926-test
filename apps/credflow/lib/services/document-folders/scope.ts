import type { DocumentRefType } from "@/lib/services/documents/types";
import { isDocumentRefType } from "@/lib/services/documents/types";
import type { FolderScope } from "./types";

export class FolderServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function normalizeScope(scope: FolderScope): {
  refType: DocumentRefType | null;
  refId: string | null;
} {
  const refType = scope.refType ?? null;
  const refId = scope.refId ?? null;
  if ((refType && !refId) || (!refType && refId)) {
    throw new FolderServiceError("refType and refId must both be set or both omitted");
  }
  if (refType && !isDocumentRefType(refType)) {
    throw new FolderServiceError("Invalid refType");
  }
  return { refType, refId };
}

export function scopeWhere(
  orgId: string,
  scope: FolderScope,
): {
  orgId: string;
  deletedAt: null;
  refType: DocumentRefType | null;
  refId: string | null;
} {
  const { refType, refId } = normalizeScope(scope);
  return {
    orgId,
    deletedAt: null,
    refType,
    refId,
  };
}

export function scopesMatch(
  a: { refType: string | null; refId: string | null },
  b: { refType: string | null; refId: string | null },
): boolean {
  return a.refType === b.refType && a.refId === b.refId;
}
