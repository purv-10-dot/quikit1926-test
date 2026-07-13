/**
 * Storage module — public surface.
 *
 * Google Cloud Storage is the only backend. Routes and services always import
 * from here, never from the concrete driver file.
 *
 *   import { getStorageDriver, fileService } from "@/lib/storage";
 *
 * Env vars consumed:
 *
 *   GCS_PROJECT_ID    = GCP project id
 *   GCS_BUCKET        = bucket name
 *   GCS_CLIENT_EMAIL  = service-account email
 *   GCS_PRIVATE_KEY   = service-account private key (escaped \n newlines)
 *
 *   # Common:
 *   STORAGE_UPLOAD_URL_TTL_SEC   = default 300
 *   STORAGE_DOWNLOAD_URL_TTL_SEC = default 300
 */

import { GcsDriver } from "./gcs-driver";
import type { StorageDriver } from "./driver";

export type { StorageDriver, PresignedUploadUrl, PresignedDownloadUrl } from "./driver";
export { GcsDriver } from "./gcs-driver";

let _driver: StorageDriver | null = null;

export function getStorageDriver(): StorageDriver {
  if (_driver) return _driver;

  const uploadTtl = parseInt(process.env.STORAGE_UPLOAD_URL_TTL_SEC ?? "300", 10);
  const downloadTtl = parseInt(process.env.STORAGE_DOWNLOAD_URL_TTL_SEC ?? "300", 10);

  _driver = new GcsDriver({
    bucket: process.env.GCS_BUCKET ?? "quikinfra-dev",
    projectId: process.env.GCS_PROJECT_ID ?? "",
    clientEmail: process.env.GCS_CLIENT_EMAIL ?? "",
    privateKey: (process.env.GCS_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
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
