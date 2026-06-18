import { randomUUID } from "node:crypto";
import { getStorageDriver } from "../src/lib/storage";

const DOCS_PREFIX = "documents";

const MAX_BYTES = 25 * 1024 * 1024; // 25MB per file
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel", "application/msword",
  "text/plain", "text/csv",
]);

export function isAllowedMime(m: string) { return ALLOWED_MIME.has(m); }
export const MAX_FILE_BYTES = MAX_BYTES;

/**
 * Upload a multipart File to S3 under `documents/<orgId>/<uuid>-<safeName>`.
 * Returns the object key (persisted as `storagePath`) + size.
 *
 * Previously wrote to the local filesystem — that didn't survive on
 * serverless (ephemeral, read-only disk), so downloads 404'd in prod.
 * S3 is the only persistent backend (see src/lib/storage).
 */
export async function saveUpload(orgId: string, file: File): Promise<{ storagePath: string; sizeBytes: number; safeName: string; }> {
  if (file.size > MAX_BYTES) throw new Error(`File too large (${(file.size / 1048576).toFixed(1)}MB > 25MB limit)`);
  if (!isAllowedMime(file.type)) throw new Error(`File type not allowed: ${file.type}`);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  const storageKey = `${DOCS_PREFIX}/${orgId}/${randomUUID()}-${safeName}`;

  const buf = Buffer.from(await file.arrayBuffer());
  await getStorageDriver().putObject({
    key: storageKey,
    body: buf,
    contentType: file.type || "application/octet-stream",
  });

  return { storagePath: storageKey, sizeBytes: file.size, safeName };
}

/**
 * Mint a short-lived presigned download URL for a stored document.
 * Passing `fileName` sets an `attachment` disposition so the browser
 * downloads with the original name (preserves the old route behaviour).
 */
export async function getDownloadUrl(storagePath: string, fileName?: string): Promise<string> {
  const { url } = await getStorageDriver().getPresignedDownloadUrl({
    key: storagePath,
    fileName,
  });
  return url;
}

export async function deleteUpload(storagePath: string): Promise<void> {
  await getStorageDriver().deleteObject(storagePath).catch(() => { /* best-effort */ });
}

// ─── Re-export the driver-based file service ───────────────────────
//
// saveUpload / getDownloadUrl / deleteUpload above are the thin
// surface used by /api/documents. The fuller driver-based file service
// in `src/lib/storage/` (presigned-PUT flow + metadata table) is used
// by /api/files/* and DPR. Both live behind the same `@/lib/storage`
// import so route handlers don't need to know which path map entry
// they're hitting.
export {
  getStorageDriver,
  resetStorageDriver,
  S3Driver,
  fileService,
  FileService,
  FileError,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
} from "../src/lib/storage";
export type {
  StorageDriver,
  PresignedUploadUrl,
  PresignedDownloadUrl,
  AttachmentEntityType,
  UploadInitResult,
} from "../src/lib/storage";
