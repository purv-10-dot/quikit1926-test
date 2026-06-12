import {
  buildPublicObjectUrl,
  deleteObject,
  getObjectBuffer,
  getPresignedGetUrl,
  isCrmDocumentS3Key,
  isS3Configured,
  putObject,
} from "@/lib/s3";

export { isS3Configured };

const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/msword",
  "application/vnd.ms-powerpoint",
  "text/plain",
  "text/csv",
]);

export function isAllowedMime(m: string): boolean {
  return ALLOWED_MIME.has(m);
}

export const MAX_FILE_BYTES = MAX_BYTES;

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

/**
 * S3 key segment: prefer folderId, else refId (legacy), else "root".
 * crm-documents/{segment}/{timestamp}-{filename}
 */
export function resolveStorageSegment(folderId: string | null | undefined, refId: string): string {
  if (folderId) return folderId;
  if (refId) return refId;
  return "root";
}

export function buildCrmDocumentStorageKey(segment: string, safeName: string): string {
  const ts = Date.now();
  return `crm-documents/${segment}/${ts}-${safeName}`;
}

export function resolveDocumentPublicUrl(storageKey: string): string {
  if (!isCrmDocumentS3Key(storageKey)) {
    return "";
  }
  try {
    return buildPublicObjectUrl(storageKey);
  } catch {
    return "";
  }
}

export async function saveCrmUpload(
  segment: string,
  file: File,
): Promise<{
  storageKey: string;
  publicUrl: string;
  size: number;
  safeName: string;
  contentType: string;
}> {
  if (!isS3Configured()) {
    throw new Error(
      "Document storage is not configured. Set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.",
    );
  }
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large (${(file.size / 1048576).toFixed(1)}MB > 25MB limit)`);
  }
  const contentType = file.type || "application/octet-stream";
  if (!isAllowedMime(contentType)) {
    throw new Error(`File type not allowed: ${contentType}`);
  }

  const safeName = sanitizeFileName(file.name || "file");
  const storageKey = buildCrmDocumentStorageKey(segment, safeName);
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    await putObject(storageKey, buf, contentType);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "S3 upload failed";
    console.error("[crm-documents] upload failed", { segment, storageKey, message });
    throw new Error(`Upload failed: ${message}`);
  }

  const publicUrl = buildPublicObjectUrl(storageKey);
  console.info("[crm-documents] uploaded", { segment, storageKey, size: file.size });

  return {
    storageKey,
    publicUrl,
    size: file.size,
    safeName,
    contentType,
  };
}

export async function readCrmUpload(storageKey: string): Promise<Buffer> {
  if (!isCrmDocumentS3Key(storageKey)) {
    throw new Error("Document is not available in cloud storage");
  }
  try {
    return await getObjectBuffer(storageKey);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "S3 read failed";
    console.error("[crm-documents] read failed", { storageKey, message });
    throw new Error(`Failed to read document: ${message}`);
  }
}

export async function getCrmUploadDownloadUrl(storageKey: string): Promise<string> {
  if (!isCrmDocumentS3Key(storageKey)) {
    throw new Error("Document is not available in cloud storage");
  }
  try {
    return await getPresignedGetUrl(storageKey);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "S3 sign failed";
    console.error("[crm-documents] presign failed", { storageKey, message });
    throw new Error(`Failed to prepare download: ${message}`);
  }
}

export async function deleteCrmUpload(storageKey: string): Promise<void> {
  if (!isCrmDocumentS3Key(storageKey)) {
    console.warn("[crm-documents] skip delete for legacy key", storageKey);
    return;
  }
  try {
    await deleteObject(storageKey);
    console.info("[crm-documents] deleted", { storageKey });
  } catch {
    /* best-effort — DB row is already soft-deleted */
  }
}
