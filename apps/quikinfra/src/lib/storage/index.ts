/**
 * Storage module — public surface.
 *
 * AWS S3 is the only backend. Routes and services always import from here,
 * never from the concrete driver file.
 *
 *   import { getStorageDriver, fileService } from "@/lib/storage";
 *
 * Env vars consumed (STORAGE_S3_* take priority; AWS_* are the fallback
 * aliases shared with quiktrack / Quikcrm — set either set, not both):
 *
 *   STORAGE_S3_REGION / AWS_REGION              = e.g. "ap-south-1"
 *   STORAGE_S3_ACCESS_KEY_ID / AWS_ACCESS_KEY_ID
 *   STORAGE_S3_SECRET_ACCESS_KEY / AWS_SECRET_ACCESS_KEY
 *   STORAGE_BUCKET / AWS_S3_BUCKET              = bucket name
 *
 *   # Common:
 *   STORAGE_UPLOAD_URL_TTL_SEC   = default 300
 *   STORAGE_DOWNLOAD_URL_TTL_SEC = default 300
 */

import { S3Driver } from "./s3-driver";
import type { StorageDriver } from "./driver";

export type { StorageDriver, PresignedUploadUrl, PresignedDownloadUrl } from "./driver";
export { S3Driver } from "./s3-driver";

let _driver: StorageDriver | null = null;

export function getStorageDriver(): StorageDriver {
  if (_driver) return _driver;

  // Plain AWS_* env vars — the same convention quiktrack / Quikcrm use, so a
  // single S3 credentials block works across every app. STORAGE_S3_* /
  // STORAGE_BUCKET below still win if set, for callers that want
  // app-specific overrides.
  const awsRegion = process.env.AWS_REGION;
  const awsBucket = process.env.AWS_S3_BUCKET;
  const awsKeyId = process.env.AWS_ACCESS_KEY_ID;
  const awsSecret = process.env.AWS_SECRET_ACCESS_KEY;

  const uploadTtl = parseInt(process.env.STORAGE_UPLOAD_URL_TTL_SEC ?? "300", 10);
  const downloadTtl = parseInt(process.env.STORAGE_DOWNLOAD_URL_TTL_SEC ?? "300", 10);

  _driver = new S3Driver({
    bucket: process.env.STORAGE_BUCKET ?? awsBucket ?? "quikinfra-dev",
    region: process.env.STORAGE_S3_REGION ?? awsRegion ?? "ap-south-1",
    accessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID ?? awsKeyId ?? "",
    secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY ?? awsSecret ?? "",
    uploadUrlTtlSeconds: uploadTtl,
    downloadUrlTtlSeconds: downloadTtl,
  });
  return _driver;
}

/** Test-only — reset the cached driver so tests can swap env vars. */
export function resetStorageDriver() {
  _driver = null;
}

export { fileService, FileService, FileError } from "./file-service";
export type { AttachmentEntityType, UploadInitResult } from "./file-service";
export { MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES } from "./validation";
