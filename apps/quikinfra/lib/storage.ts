import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

export const DOCS_ROOT =
  process.env.QC_DOCS_ROOT ?? path.join(process.cwd(), "uploads");

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
 * Write a multipart File to disk under DOCS_ROOT/<orgId>/<uuid>-<safeName>.
 * Returns the relative storagePath + size.
 */
export async function saveUpload(orgId: string, file: File): Promise<{ storagePath: string; sizeBytes: number; safeName: string; }> {
  if (file.size > MAX_BYTES) throw new Error(`File too large (${(file.size / 1048576).toFixed(1)}MB > 25MB limit)`);
  if (!isAllowedMime(file.type)) throw new Error(`File type not allowed: ${file.type}`);

  const tenantDir = path.join(DOCS_ROOT, orgId);
  await fs.mkdir(tenantDir, { recursive: true });
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  const storageName = `${randomUUID()}-${safeName}`;
  const abs = path.join(tenantDir, storageName);

  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(abs, buf);

  return { storagePath: `${orgId}/${storageName}`, sizeBytes: file.size, safeName };
}

export function resolveStoragePath(relative: string): string {
  // Guard against path traversal
  const normalized = path.normalize(relative);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("Invalid storage path");
  }
  return path.join(DOCS_ROOT, normalized);
}

export async function readUpload(storagePath: string): Promise<Buffer> {
  return fs.readFile(resolveStoragePath(storagePath));
}

export async function deleteUpload(storagePath: string): Promise<void> {
  try { await fs.unlink(resolveStoragePath(storagePath)); } catch { /* already gone */ }
}

// ─── Re-export the driver-based file service ───────────────────────
//
// The functions above (saveUpload / readUpload / deleteUpload) are the
// simple legacy path used by /api/documents — they write to a fixed
// uploads dir on the local filesystem. The driver-based file service in
// `src/lib/storage/` is the newer abstraction used by /api/files/* and
// supports S3 / R2 / local with presigned URLs. Both surfaces live behind
// the same `@/lib/storage` import so route handlers don't need to know
// which path map entry they're hitting.
export {
  getStorageDriver,
  resetStorageDriver,
  S3Driver,
  LocalDriver,
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
